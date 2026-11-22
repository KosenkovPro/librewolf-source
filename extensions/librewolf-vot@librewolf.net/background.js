// The client of the Yandex translation service. The service is asked for the
// translation of a video, it answers with the address of the translated sound
// when the work is done.
//
// The service is reached the same way the open source client of it does, that
// client is distributed under the MIT licence:
//   https://github.com/FOSWLY/vot.js

const API_HOST = "api.browser.yandex.ru";
const API_BASE = `https://${API_HOST}`;

// The version of the component of the service and the key of the signature.
// Both are the constants of the service, they are the same as in the open
// source client of it.
const COMPONENT_VERSION = "26.11.0.1993";
const HMAC_KEY = "bt8xH3VOlb4mqf0nqAibnDOoiPlXsisf";

// The module of the service that translates the videos.
const MODULE = "video-translation";

// The states the service answers with.
const STATUS_FAILED = 0;
const STATUS_FINISHED = 1;
const STATUS_WAITING = 2;
const STATUS_LONG_WAITING = 3;
const STATUS_PART_CONTENT = 5;
const STATUS_AUDIO_REQUESTED = 6;
const STATUS_SESSION_REQUIRED = 7;

const PATHS = {
  session: "/session/create",
  translate: "/video-translation/translate",
  audio: "/video-translation/audio",
  failAudio: "/video-translation/fail-audio-js",
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** The session of the service, it holds the key of the signature. */
let session = null;

/** The work in progress, it is stopped when the page says so. */
let currentJob = null;

/** The signature of the body of a request. */
async function signature(data) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(HMAC_KEY),
    { name: "HMAC", hash: { name: "SHA-256" } },
    false,
    ["sign"],
  );
  const result = await crypto.subtle.sign("HMAC", key, data);
  return Array.from(new Uint8Array(result))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** A random name for a session, the service wants it in upper case. */
function randomUuid() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/**
 * The answer of the service when it refuses a request.
 *
 * The service explains the refusal in the body of the answer, the user needs
 * to see it: the refusal can mean that the address of the machine is not
 * allowed or that the account of the service is needed.
 */
function refusal(response, path) {
  return response.text().then(
    (raw) => {
      const clean = String(raw || "")
        .replace(/[^\x20-\x7e]+/g, " ")
        .trim()
        .slice(0, 160);
      return `The service answered ${response.status} to ${path}${
        clean ? ` — ${clean}` : ""
      }`;
    },
    () => `The service answered ${response.status} to ${path}`,
  );
}

/** Opens a session of the service and remembers its key. */
async function openSession() {
  const uuid = randomUuid();
  const body = LibreWolfVotProtobuf.encodeSessionRequest(uuid, MODULE);
  const response = await fetch(`${API_BASE}${PATHS.session}`, {
    method: "POST",
    headers: {
      Accept: "application/x-protobuf",
      "Content-Type": "application/x-protobuf",
      "Vtrans-Signature": await signature(body),
      Pragma: "no-cache",
      "Cache-Control": "no-cache",
    },
    body,
  });

  if (!response.ok) {
    throw new Error(await refusal(response, PATHS.session));
  }

  const answer = LibreWolfVotProtobuf.decodeSessionResponse(
    new Uint8Array(await response.arrayBuffer()),
  );
  session = {
    uuid,
    secretKey: answer.secretKey,
    expires: answer.expires,
    created: Math.floor(Date.now() / 1000),
  };
  return session;
}

/** The session of the service, a new one is opened when the old one is old. */
async function getSession() {
  const now = Math.floor(Date.now() / 1000);
  if (session && session.created + session.expires > now + 30) {
    return session;
  }
  return openSession();
}

/** The headers that the service wants on every request with a body. */
async function secHeaders(path, body) {
  const current = await getSession();
  const token = `${current.uuid}:${path}:${COMPONENT_VERSION}`;
  const tokenSign = await signature(encoder.encode(token));

  return {
    "Vtrans-Signature": await signature(body),
    "Sec-Vtrans-Sk": current.secretKey,
    "Sec-Vtrans-Token": `${tokenSign}:${token}`,
  };
}

/** A request to the service with a body in the protobuf format. */
async function request(path, body, method = "POST") {
  const headers = {
    Accept: "application/x-protobuf",
    "Content-Type": "application/x-protobuf",
    "Accept-Language": "en",
    Pragma: "no-cache",
    "Cache-Control": "no-cache",
    ...(await secHeaders(path, body)),
  };

  const response = await fetch(`${API_BASE}${path}`, { method, headers, body });
  if (!response.ok) {
    throw new Error(await refusal(response, path));
  }
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Asks the service to translate the video.
 *
 * @param {object} video the video with its address and its languages
 * @param {boolean} first true for the first request of the translation
 * @returns {Promise<object>} the answer of the service
 */
async function askTranslation(video, first) {
  const body = LibreWolfVotProtobuf.encodeTranslationRequest({
    url: video.url,
    firstRequest: first,
    duration: video.duration || 310,
    sourceLanguage: video.sourceLanguage || "en",
    targetLanguage: video.targetLanguage || "ru",
    title: video.title || "",
  });

  const answer = await request(PATHS.translate, body);
  return LibreWolfVotProtobuf.decodeTranslationResponse(answer);
}

/**
 * Asks the service to take the sound of the video by itself.
 *
 * The service can get the sound of a video of YouTube on its own, this is the
 * way that the fork uses, it does not need to take the sound out of the page.
 */
async function askFailAudio(videoUrl) {
  const response = await fetch(`${API_BASE}${PATHS.failAudio}`, {
    method: "PUT",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ video_url: videoUrl }),
  });

  const answer = await response.json().catch(() => null);
  if (!response.ok || !answer || answer.status !== 1) {
    throw new Error("The service did not take the sound of the video");
  }
}

/**
 * Gives the sound of the video to the service.
 *
 * The sound may be empty, the service then takes it by itself.
 */
async function sendAudio(video, translationId, fileId) {
  const body = LibreWolfVotProtobuf.encodeAudioRequest(
    video,
    translationId,
    new Uint8Array(0),
    fileId,
  );
  return LibreWolfVotProtobuf.decodeAudioResponse(
    await request(PATHS.audio, body, "PUT"),
  );
}

/** The state of the job is sent to the page. */
function report(state, extra = {}) {
  const tabId = currentJob?.tabId;
  if (!tabId) {
    return;
  }
  browser.tabs
    .sendMessage(tabId, {
      type: "librewolf-vot-state",
      state,
      ...extra,
    })
    .catch(() => {
      // The page is closed, nobody listens to the state.
    });
}

/** Waits for the given number of seconds. */
function wait(seconds) {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

/**
 * The whole work of the translation: the first request, the wait for the
 * service and the answer with the address of the translated sound.
 */
async function runTranslation(video, tabId) {
  currentJob = { video, tabId, stopped: false };

  try {
    report("working", { message: "The service is asked for the translation" });

    let answer = await askTranslation(video, true);
    let sentEmptyAudio = false;

    while (true) {
      if (currentJob.stopped) {
        report("stopped", { message: "The translation is stopped" });
        return;
      }

      const { status } = answer;

      if (status === STATUS_FAILED) {
        throw new Error(answer.message || "The service could not translate the video");
      }

      if (status === STATUS_SESSION_REQUIRED) {
        throw new Error("The service asks for an account, this video cannot be translated");
      }

      if (status === STATUS_FINISHED || status === STATUS_PART_CONTENT) {
        if (!answer.url) {
          throw new Error("The service did not send the address of the translation");
        }
        report("ready", {
          message: "The translation is ready",
          audioUrl: answer.url,
          translationId: answer.translationId,
        });
        return;
      }

      if (status === STATUS_AUDIO_REQUESTED) {
        // The service asks for the sound of the video. It can take it by
        // itself for the videos of YouTube.
        if (!sentEmptyAudio) {
          report("working", { message: "The sound of the video is sent to the service" });
          await askFailAudio(video.url);
          await sendAudio(
            video,
            answer.translationId,
            `fallback-empty-audio:video-translation:${video.videoId}`,
          );
          sentEmptyAudio = true;
        }
        answer = await askTranslation(video, false);
        continue;
      }

      // The service is still working on the video.
      const remaining = answer.remainingTime ?? 10;
      report("waiting", {
        message: "The service is translating the video",
        remainingTime: remaining,
      });
      await wait(Math.min(Math.max(remaining, 3), 30));
      answer = await askTranslation(video, false);
    }
  } catch (error) {
    report("error", { message: String(error.message || error) });
  } finally {
    currentJob = null;
  }
}

browser.runtime.onMessage.addListener(async (message, sender) => {
  switch (message?.type) {
    case "librewolf-vot-translate": {
      const video = message.video || {};
      if (!video.videoId || !video.url) {
        return { ok: false, error: "The page did not send the address of the video" };
      }
      if (currentJob) {
        currentJob.stopped = true;
      }
      const tabId = sender.tab?.id ?? message.tabId;
      runTranslation(video, tabId);
      return { ok: true };
    }

    case "librewolf-vot-stop": {
      if (currentJob) {
        currentJob.stopped = true;
      }
      return { ok: true };
    }

    case "librewolf-vot-get-state": {
      return {
        working: Boolean(currentJob),
        language: (await browser.storage.local.get("librewolf-vot-language"))[
          "librewolf-vot-language"
        ] || { source: "auto", target: "ru" },
      };
    }

    case "librewolf-vot-set-language": {
      await browser.storage.local.set({ "librewolf-vot-language": message.language });
      return { ok: true };
    }

    case "librewolf-vot-fetch-audio": {
      // The sound of the translation is read here, when the page cannot load it
      // by itself.
      const response = await fetch(message.url);
      if (!response.ok) {
        throw new Error(`The sound of the translation answered ${response.status}`);
      }
      const type = response.headers.get("content-type") || "audio/mpeg";
      const buffer = await response.arrayBuffer();
      return { buffer, type };
    }

    default:
      return undefined;
  }
});

browser.browserAction.onClicked.addListener(async (tab) => {
  if (!tab.id) {
    return;
  }
  try {
    await browser.tabs.sendMessage(tab.id, { type: "librewolf-vot-open" });
  } catch (error) {
    console.debug("The page of the video is not ready", error);
  }
});
