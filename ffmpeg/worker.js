import {
  CORE_URL,
  FFMessageType,
} from "./const.js";

import {
  ERROR_UNKNOWN_MESSAGE_TYPE,
  ERROR_NOT_LOADED,
  ERROR_IMPORT_FAILURE,
} from "./errors.js";

let ffmpeg = null;

const load = async ({
  coreURL: _coreURL,
  wasmURL: _wasmURL,
  workerURL: _workerURL,
} = {}) => {
  const first = !ffmpeg;

  try {
    if (!_coreURL) {
      throw new Error("coreURL is required");
    }

    // تحميل ffmpeg-core.js داخل Module Worker
    const module = await import(_coreURL);

    if (!module || !module.default) {
      throw ERROR_IMPORT_FAILURE;
    }

    const createFFmpegCore = module.default;

    const coreURL = _coreURL;

    const wasmURL =
      _wasmURL ||
      coreURL.replace(/\.js$/i, ".wasm");

    const workerURL =
      _workerURL ||
      coreURL.replace(/\.js$/i, ".worker.js");

    ffmpeg = await createFFmpegCore({
      mainScriptUrlOrBlob:
        `${coreURL}#${btoa(
          JSON.stringify({
            wasmURL,
            workerURL,
          })
        )}`,
    });

    ffmpeg.setLogger((data) => {
      self.postMessage({
        type: FFMessageType.LOG,
        data,
      });
    });

    ffmpeg.setProgress((data) => {
      self.postMessage({
        type: FFMessageType.PROGRESS,
        data,
      });
    });

    return first;
  } catch (error) {
    console.error("[WFESC FFmpeg Worker]", error);
    throw error;
  }
};

const exec = ({
  args,
  timeout = -1,
}) => {
  if (!ffmpeg) {
    throw ERROR_NOT_LOADED;
  }

  ffmpeg.setTimeout(timeout);
  ffmpeg.exec(...args);

  const ret = ffmpeg.ret;

  ffmpeg.reset();

  return ret;
};

const ffprobe = ({
  args,
  timeout = -1,
}) => {
  if (!ffmpeg) {
    throw ERROR_NOT_LOADED;
  }

  ffmpeg.setTimeout(timeout);
  ffmpeg.ffprobe(...args);

  const ret = ffmpeg.ret;

  ffmpeg.reset();

  return ret;
};

const writeFile = ({
  path,
  data,
}) => {
  if (!ffmpeg) {
    throw ERROR_NOT_LOADED;
  }

  ffmpeg.FS.writeFile(path, data);

  return true;
};

const readFile = ({
  path,
  encoding,
}) => {
  if (!ffmpeg) {
    throw ERROR_NOT_LOADED;
  }

  return ffmpeg.FS.readFile(path, {
    encoding,
  });
};

const deleteFile = ({
  path,
}) => {
  if (!ffmpeg) {
    throw ERROR_NOT_LOADED;
  }

  ffmpeg.FS.unlink(path);

  return true;
};

const rename = ({
  oldPath,
  newPath,
}) => {
  if (!ffmpeg) {
    throw ERROR_NOT_LOADED;
  }

  ffmpeg.FS.rename(oldPath, newPath);

  return true;
};

const createDir = ({
  path,
}) => {
  if (!ffmpeg) {
    throw ERROR_NOT_LOADED;
  }

  ffmpeg.FS.mkdir(path);

  return true;
};

const listDir = ({
  path,
}) => {
  if (!ffmpeg) {
    throw ERROR_NOT_LOADED;
  }

  const names = ffmpeg.FS.readdir(path);

  return names.map((name) => {
    const stat = ffmpeg.FS.stat(`${path}/${name}`);

    return {
      name,
      isDir: ffmpeg.FS.isDir(stat.mode),
    };
  });
};

const deleteDir = ({
  path,
}) => {
  if (!ffmpeg) {
    throw ERROR_NOT_LOADED;
  }

  ffmpeg.FS.rmdir(path);

  return true;
};

const mount = ({
  fsType,
  options,
  mountPoint,
}) => {
  if (!ffmpeg) {
    throw ERROR_NOT_LOADED;
  }

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
};

const unmount = ({
  mountPoint,
}) => {
  if (!ffmpeg) {
    throw ERROR_NOT_LOADED;
  }

  ffmpeg.FS.unmount(mountPoint);

  return true;
};

self.onmessage = async ({
  data: {
    id,
    type,
    data: inputData,
  },
}) => {
  const transferable = [];

  let data;

  try {
    if (
      type !== FFMessageType.LOAD &&
      !ffmpeg
    ) {
      throw ERROR_NOT_LOADED;
    }

    switch (type) {
      case FFMessageType.LOAD:
        data = await load(inputData);
        break;

      case FFMessageType.EXEC:
        data = exec(inputData);
        break;

      case FFMessageType.FFPROBE:
        data = ffprobe(inputData);
        break;

      case FFMessageType.WRITE_FILE:
        data = writeFile(inputData);
        break;

      case FFMessageType.READ_FILE:
        data = readFile(inputData);
        break;

      case FFMessageType.DELETE_FILE:
        data = deleteFile(inputData);
        break;

      case FFMessageType.RENAME:
        data = rename(inputData);
        break;

      case FFMessageType.CREATE_DIR:
        data = createDir(inputData);
        break;

      case FFMessageType.LIST_DIR:
        data = listDir(inputData);
        break;

      case FFMessageType.DELETE_DIR:
        data = deleteDir(inputData);
        break;

      case FFMessageType.MOUNT:
        data = mount(inputData);
        break;

      case FFMessageType.UNMOUNT:
        data = unmount(inputData);
        break;

      default:
        throw ERROR_UNKNOWN_MESSAGE_TYPE;
    }
  } catch (error) {
    self.postMessage({
      id,
      type: FFMessageType.ERROR,
      data: error instanceof Error
        ? error.toString()
        : String(error),
    });

    return;
  }

  if (data instanceof Uint8Array) {
    transferable.push(data.buffer);
  }

  self.postMessage(
    {
      id,
      type,
      data,
    },
    transferable
  );
};
