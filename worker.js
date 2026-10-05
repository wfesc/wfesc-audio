import {
  CORE_URL,
  FFMessageType
} from "./const.js";

import {
  ERROR_UNKNOWN_MESSAGE_TYPE,
  ERROR_NOT_LOADED,
  ERROR_IMPORT_FAILURE
} from "./errors.js";

let ffmpeg = null;

async function load({
  coreURL: inputCoreURL,
  wasmURL: inputWasmURL,
  workerURL: inputWorkerURL
}) {
  const first = !ffmpeg;

  let coreURL = inputCoreURL || CORE_URL;

  try {
    importScripts(coreURL);

    if (!self.createFFmpegCore) {
      throw ERROR_IMPORT_FAILURE;
    }
  } catch (classicError) {
    try {
      if (!inputCoreURL) {
        coreURL = CORE_URL.replace("/umd/", "/esm/");
      }

      const module = await import(coreURL);

      self.createFFmpegCore = module.default;

      if (!self.createFFmpegCore) {
        throw ERROR_IMPORT_FAILURE;
      }
    } catch (moduleError) {
      throw new Error(
        "FFmpeg Core failed to load: " +
        (moduleError?.message || moduleError)
      );
    }
  }

  const wasmURL =
    inputWasmURL ||
    coreURL.replace(/\.js$/i, ".wasm");

  const workerURL =
    inputWorkerURL ||
    coreURL.replace(/\.js$/i, ".worker.js");

  ffmpeg = await self.createFFmpegCore({
    mainScriptUrlOrBlob:
      coreURL +
      "#" +
      btoa(
        JSON.stringify({
          wasmURL,
          workerURL
        })
      )
  });

  ffmpeg.setLogger((data) => {
    self.postMessage({
      type: FFMessageType.LOG,
      data
    });
  });

  ffmpeg.setProgress((data) => {
    self.postMessage({
      type: FFMessageType.PROGRESS,
      data
    });
  });

  return first;
}

function exec({
  args,
  timeout = -1
}) {
  ffmpeg.setTimeout(timeout);

  ffmpeg.exec(...args);

  const ret = ffmpeg.ret;

  ffmpeg.reset();

  return ret;
}

function writeFile({
  path,
  data
}) {
  ffmpeg.FS.writeFile(path, data);
  return true;
}

function readFile({
  path,
  encoding
}) {
  return ffmpeg.FS.readFile(path, {
    encoding
  });
}

function deleteFile({
  path
}) {
  ffmpeg.FS.unlink(path);
  return true;
}

function rename({
  oldPath,
  newPath
}) {
  ffmpeg.FS.rename(oldPath, newPath);
  return true;
}

function createDir({
  path
}) {
  ffmpeg.FS.mkdir(path);
  return true;
}

function listDir({
  path
}) {
  const names = ffmpeg.FS.readdir(path);
  const nodes = [];

  for (const name of names) {
    const stat = ffmpeg.FS.stat(`${path}/${name}`);

    nodes.push({
      name,
      isDir: ffmpeg.FS.isDir(stat.mode)
    });
  }

  return nodes;
}

function deleteDir({
  path
}) {
  ffmpeg.FS.rmdir(path);
  return true;
}

function mount({
  fsType,
  options,
  mountPoint
}) {
  const fs = ffmpeg.FS.filesystems[fsType];

  if (!fs) {
    return false;
  }

  ffmpeg.FS.mount(
    fs,
    options,
    mountPoint
  );

  return true;
}

function unmount({
  mountPoint
}) {
  ffmpeg.FS.unmount(mountPoint);
  return true;
}

self.onmessage = async ({
  data
}) => {
  const {
    id,
    type,
    data: payload
  } = data;

  let result;

  try {
    if (
      type !== FFMessageType.LOAD &&
      !ffmpeg
    ) {
      throw ERROR_NOT_LOADED;
    }

    switch (type) {
      case FFMessageType.LOAD:
        result = await load(payload);
        break;

      case FFMessageType.EXEC:
        result = exec(payload);
        break;

      case FFMessageType.WRITE_FILE:
        result = writeFile(payload);
        break;

      case FFMessageType.READ_FILE:
        result = readFile(payload);
        break;

      case FFMessageType.DELETE_FILE:
        result = deleteFile(payload);
        break;

      case FFMessageType.RENAME:
        result = rename(payload);
        break;

      case FFMessageType.CREATE_DIR:
        result = createDir(payload);
        break;

      case FFMessageType.LIST_DIR:
        result = listDir(payload);
        break;

      case FFMessageType.DELETE_DIR:
        result = deleteDir(payload);
        break;

      case FFMessageType.MOUNT:
        result = mount(payload);
        break;

      case FFMessageType.UNMOUNT:
        result = unmount(payload);
        break;

      default:
        throw ERROR_UNKNOWN_MESSAGE_TYPE;
    }

    const transfer = [];

    if (result instanceof Uint8Array) {
      transfer.push(result.buffer);
    }

    self.postMessage(
      {
        id,
        type,
        data: result
      },
      transfer
    );

  } catch (error) {

    self.postMessage({
      id,
      type: FFMessageType.ERROR,
      data: String(error)
    });

  }
};
