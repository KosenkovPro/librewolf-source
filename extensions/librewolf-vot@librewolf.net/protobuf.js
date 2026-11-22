// A small codec for the protocol buffers of the Yandex translation service.
// Only the messages that the fork needs are described here, the fields and
// their numbers come from the public description of the service:
//
//   VideoTranslationRequest, VideoTranslationResponse,
//   VideoTranslationAudioRequest, VideoTranslationAudioResponse,
//   YandexSessionRequest, YandexSessionResponse
//
// The service is reached the same way the open source client of it does, the
// client is distributed under the MIT licence:
//   https://github.com/FOSWLY/vot.js

const WIRE_VARINT = 0;
const WIRE_64BIT = 1;
const WIRE_LENGTH = 2;
const WIRE_32BIT = 5;

/** The bytes of a number in the protobuf format. */
function encodeVarint(value) {
  const bytes = [];
  let rest = value;

  while (rest > 0x7f) {
    bytes.push((rest & 0x7f) | 0x80);
    rest = Math.floor(rest / 128);
  }
  bytes.push(rest);
  return bytes;
}

/** The bytes of a number with a sign, in the protobuf format. */
function encodeVarintSigned(value) {
  if (value >= 0) {
    return encodeVarint(value);
  }

  // A negative number takes ten bytes in the protobuf format.
  const bytes = [];
  let rest = BigInt.asUintN(64, BigInt(value));
  while (rest > 0x7fn) {
    bytes.push(Number(rest & 0x7fn) | 0x80);
    rest >>= 7n;
  }
  bytes.push(Number(rest));
  return bytes;
}

/** The head of a field: its number and the kind of its value. */
function encodeTag(field, wireType) {
  return encodeVarint((field << 3) | wireType);
}

function concat(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function encodeString(field, value) {
  if (value === undefined || value === null || value === "") {
    return [];
  }
  const bytes = new TextEncoder().encode(String(value));
  return concat([encodeTag(field, WIRE_LENGTH), encodeVarint(bytes.length), bytes]);
}

function encodeBytes(field, value) {
  if (!value || !value.length) {
    return [];
  }
  return concat([
    encodeTag(field, WIRE_LENGTH),
    encodeVarint(value.length),
    value,
  ]);
}

function encodeBool(field, value) {
  if (!value) {
    return [];
  }
  return concat([encodeTag(field, WIRE_VARINT), encodeVarint(1)]);
}

function encodeInt32(field, value) {
  if (!value) {
    return [];
  }
  return concat([encodeTag(field, WIRE_VARINT), encodeVarintSigned(value)]);
}

function encodeDouble(field, value) {
  if (!value) {
    return [];
  }
  const buffer = new ArrayBuffer(8);
  new DataView(buffer).setFloat64(0, value, true);
  return concat([encodeTag(field, WIRE_64BIT), new Uint8Array(buffer)]);
}

/**
 * Reads the fields of a message.
 *
 * @param {Uint8Array} bytes the answer of the service
 * @returns {Map<number, {wireType: number, value: any}>} the fields by number
 */
function decodeMessage(bytes) {
  const fields = new Map();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;

  const readVarint = () => {
    let result = 0;
    let shift = 0;
    while (offset < bytes.length) {
      const byte = bytes[offset++];
      result += (byte & 0x7f) * 2 ** shift;
      if ((byte & 0x80) === 0) {
        return result;
      }
      shift += 7;
      if (shift > 63) {
        throw new Error("The answer of the service is too long");
      }
    }
    throw new Error("The answer of the service ends too early");
  };

  while (offset < bytes.length) {
    const tag = readVarint();
    const field = tag >>> 3;
    const wireType = tag & 7;

    if (wireType === WIRE_VARINT) {
      fields.set(field, { wireType, value: readVarint() });
      continue;
    }

    if (wireType === WIRE_64BIT) {
      fields.set(field, { wireType, value: view.getFloat64(offset, true) });
      offset += 8;
      continue;
    }

    if (wireType === WIRE_32BIT) {
      fields.set(field, { wireType, value: view.getUint32(offset, true) });
      offset += 4;
      continue;
    }

    if (wireType === WIRE_LENGTH) {
      const length = readVarint();
      const start = offset;
      offset += length;
      if (offset > bytes.length) {
        throw new Error("The answer of the service ends too early");
      }
      fields.set(field, { wireType, value: bytes.subarray(start, offset) });
      continue;
    }

    // The groups are not used by the service, they are skipped.
    throw new Error(`Unknown kind of value in the answer of the service: ${wireType}`);
  }

  return fields;
}

function readString(fields, field) {
  const entry = fields.get(field);
  if (!entry || entry.wireType !== WIRE_LENGTH) {
    return undefined;
  }
  return new TextDecoder().decode(entry.value);
}

function readNumber(fields, field) {
  const entry = fields.get(field);
  if (!entry) {
    return undefined;
  }
  if (entry.wireType === WIRE_VARINT) {
    return entry.value;
  }
  if (entry.wireType === WIRE_64BIT) {
    return entry.value;
  }
  return undefined;
}

function readBool(fields, field) {
  const value = readNumber(fields, field);
  return value === undefined ? undefined : Boolean(value);
}

/** The request that opens a session of the service. */
function encodeSessionRequest(uuid, module) {
  return concat([encodeString(1, uuid), encodeString(2, module)]);
}

/** The answer with the key of the session. */
function decodeSessionResponse(bytes) {
  const fields = decodeMessage(bytes);
  return {
    secretKey: readString(fields, 1) || "",
    expires: readNumber(fields, 2) || 0,
  };
}

/**
 * The request of the translation of a video.
 *
 * @param {object} video the video with its address, length and languages
 * @returns {Uint8Array} the request
 */
function encodeTranslationRequest(video) {
  return concat([
    encodeString(3, video.url),
    encodeBool(5, video.firstRequest),
    encodeDouble(6, video.duration),
    encodeBool(7, true),
    encodeString(8, video.sourceLanguage),
    encodeBool(9, video.forceSourceLang),
    encodeBool(10, false),
    encodeBool(13, false),
    encodeString(14, video.targetLanguage),
    encodeBool(15, true),
    encodeInt32(16, 2),
    encodeBool(17, false),
    encodeBool(18, false),
    encodeString(19, video.title),
  ]);
}

/** The answer with the state of the translation. */
function decodeTranslationResponse(bytes) {
  const fields = decodeMessage(bytes);
  return {
    url: readString(fields, 1),
    duration: readNumber(fields, 2),
    status: readNumber(fields, 4) ?? 0,
    remainingTime: readNumber(fields, 5),
    translationId: readString(fields, 7) || "",
    language: readString(fields, 8),
    message: readString(fields, 9),
    isLivelyVoice: readBool(fields, 10),
    allowToTranslateVideo: readBool(fields, 11),
    shouldRetry: readNumber(fields, 12),
  };
}

/**
 * The request that gives the sound of the video to the service.
 *
 * @param {object} video the address of the video and the id of the translation
 * @param {Uint8Array} audio the sound of the video
 * @param {string} fileId the name of the file with the sound
 * @returns {Uint8Array} the request
 */
function encodeAudioRequest(video, translationId, audio, fileId) {
  const audioInfo = concat([
    encodeString(1, fileId),
    encodeBytes(2, audio),
  ]);
  return concat([
    encodeString(1, translationId),
    encodeString(2, video.url),
    encodeBytes(6, audioInfo),
  ]);
}

/** The answer with the state of the sound. */
function decodeAudioResponse(bytes) {
  const fields = decodeMessage(bytes);
  return {
    status: readNumber(fields, 1) ?? 0,
  };
}

if (typeof globalThis !== "undefined") {
  globalThis.LibreWolfVotProtobuf = {
    encodeSessionRequest,
    decodeSessionResponse,
    encodeTranslationRequest,
    decodeTranslationResponse,
    encodeAudioRequest,
    decodeAudioResponse,
  };
}
