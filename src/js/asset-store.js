(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};
  var fileStore = ME.fileStore;

  var imageExtensions = {
    "image/gif": "gif",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp"
  };

  var imagePickerTypes = [
    {
      description: "Images",
      accept: {
        "image/*": [".gif", ".jpg", ".jpeg", ".png", ".webp"]
      }
    }
  ];

  function isStorageSupported() {
    return typeof window.showDirectoryPicker === "function";
  }

  function isImagePickerSupported() {
    return isStorageSupported() && typeof window.showOpenFilePicker === "function";
  }

  function isAbortError(error) {
    return Boolean(
      error &&
      (error.name === "AbortError" || (fileStore && fileStore.isAbortError(error)))
    );
  }

  async function ensurePermission(handle, mode) {
    var options = { mode: mode || "read" };
    var currentPermission;
    var nextPermission;

    if (!handle || typeof handle.queryPermission !== "function") {
      return true;
    }

    if (fileStore && typeof fileStore.ensurePermission === "function") {
      return fileStore.ensurePermission(handle, mode);
    }

    if (typeof handle.requestPermission === "function") {
      try {
        nextPermission = await handle.requestPermission(options);
        if (nextPermission === "granted") {
          return true;
        }
      } catch (error) {
        currentPermission = await handle.queryPermission(options);
        return currentPermission === "granted";
      }
    }

    currentPermission = await handle.queryPermission(options);
    return currentPermission === "granted";
  }

  async function ensureWorkspaceDir(session) {
    var workspaceDirHandle;

    if (!isStorageSupported()) {
      throw new Error("Image storage is not supported in this browser.");
    }

    if (session && session.workspaceDirHandle) {
      if (await ensurePermission(session.workspaceDirHandle, "readwrite")) {
        return session.workspaceDirHandle;
      }
    }

    workspaceDirHandle = await window.showDirectoryPicker({
      mode: "readwrite"
    });

    if (!(await ensurePermission(workspaceDirHandle, "readwrite"))) {
      throw new Error("Permission was not granted for this workspace.");
    }

    if (session) {
      session.workspaceDirHandle = workspaceDirHandle;
    }

    return workspaceDirHandle;
  }

  function sessionAssetDirName(session) {
    return (session && session.assetDirName) || "assets";
  }

  async function ensureAssetDir(session) {
    var workspaceDirHandle = await ensureWorkspaceDir(session);
    return workspaceDirHandle.getDirectoryHandle(sessionAssetDirName(session), { create: true });
  }

  function imageExtension(file) {
    return imageExtensions[String((file && file.type) || "").toLowerCase()] || "";
  }

  function assertSupportedImage(file) {
    var extension = imageExtension(file);

    if (!file || !/^image\//i.test(file.type || "")) {
      throw new Error("Choose an image file.");
    }

    if (!extension) {
      throw new Error("Only PNG, JPEG, WebP, and GIF images are supported.");
    }

    return extension;
  }

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function timestamp(date) {
    date = date || new Date();
    return (
      String(date.getFullYear()) +
      pad(date.getMonth() + 1) +
      pad(date.getDate()) +
      "-" +
      pad(date.getHours()) +
      pad(date.getMinutes()) +
      pad(date.getSeconds())
    );
  }

  function fileStem(name) {
    return String(name || "").replace(/\.[^.]*$/, "");
  }

  function safeFileStem(name, fallback) {
    var stem = fileStem(name)
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64);

    return stem || fallback || "image";
  }

  function baseNameForFile(file, options) {
    var prefix = (options && options.prefix) || "image";
    var fallback = prefix + "-" + timestamp();

    if (options && options.baseName) {
      return safeFileStem(options.baseName, fallback);
    }

    if (prefix === "pasted") {
      return fallback;
    }

    return safeFileStem(file && file.name, fallback);
  }

  async function fileExists(directoryHandle, fileName) {
    try {
      await directoryHandle.getFileHandle(fileName, { create: false });
      return true;
    } catch (error) {
      if (error && error.name === "NotFoundError") {
        return false;
      }
      throw error;
    }
  }

  async function uniqueFileName(directoryHandle, baseName, extension) {
    var index = 1;
    var candidate = baseName + "." + extension;

    while (await fileExists(directoryHandle, candidate)) {
      index += 1;
      candidate = baseName + "-" + index + "." + extension;
    }

    return candidate;
  }

  async function saveImageFile(session, file, options) {
    var extension = assertSupportedImage(file);
    var directoryHandle = await ensureAssetDir(session);
    var fileName = await uniqueFileName(directoryHandle, baseNameForFile(file, options || {}), extension);
    var fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
    var writable = await fileHandle.createWritable();

    await writable.write(file);
    await writable.close();

    return sessionAssetDirName(session) + "/" + fileName;
  }

  async function chooseImageFile() {
    var handles;
    var file;

    if (!isImagePickerSupported()) {
      throw new Error("Image selection is not supported in this browser.");
    }

    handles = await window.showOpenFilePicker({
      multiple: false,
      types: imagePickerTypes
    });

    file = await handles[0].getFile();
    assertSupportedImage(file);
    return file;
  }

  function hasImageItems(dataTransfer) {
    var i;

    if (!dataTransfer) {
      return false;
    }

    if (dataTransfer.items && dataTransfer.items.length) {
      for (i = 0; i < dataTransfer.items.length; i += 1) {
        if (
          dataTransfer.items[i].kind === "file" &&
          /^image\//i.test(dataTransfer.items[i].type || "")
        ) {
          return true;
        }
      }
    }

    if (dataTransfer.files && dataTransfer.files.length) {
      for (i = 0; i < dataTransfer.files.length; i += 1) {
        if (/^image\//i.test(dataTransfer.files[i].type || "")) {
          return true;
        }
      }
    }

    return false;
  }

  function imageFilesFromTransfer(dataTransfer) {
    var files = [];
    var seen = [];
    var i;
    var file;

    function addFile(candidate) {
      if (!candidate || !/^image\//i.test(candidate.type || "") || seen.indexOf(candidate) !== -1) {
        return;
      }
      seen.push(candidate);
      files.push(candidate);
    }

    if (!dataTransfer) {
      return files;
    }

    if (dataTransfer.items && dataTransfer.items.length) {
      for (i = 0; i < dataTransfer.items.length; i += 1) {
        if (
          dataTransfer.items[i].kind === "file" &&
          /^image\//i.test(dataTransfer.items[i].type || "") &&
          typeof dataTransfer.items[i].getAsFile === "function"
        ) {
          addFile(dataTransfer.items[i].getAsFile());
        }
      }
    }

    if (dataTransfer.files && dataTransfer.files.length) {
      for (i = 0; i < dataTransfer.files.length; i += 1) {
        file = dataTransfer.files[i];
        addFile(file);
      }
    }

    return files;
  }

  function imageAlt(file, fallback) {
    return String(fileStem(file && file.name) || fallback || "image")
      .replace(/[\r\n\[\]]+/g, " ")
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim() || fallback || "image";
  }

  ME.assetStore = {
    chooseImageFile: chooseImageFile,
    hasImageItems: hasImageItems,
    imageAlt: imageAlt,
    imageFilesFromTransfer: imageFilesFromTransfer,
    isAbortError: isAbortError,
    isImagePickerSupported: isImagePickerSupported,
    isStorageSupported: isStorageSupported,
    isSupported: isStorageSupported,
    saveImageFile: saveImageFile
  };
}());
