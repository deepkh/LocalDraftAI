(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};

  function createTabManager(options) {
    options = options || {};

    var sessions = [];
    var activeSessionId = null;
    var createSession = options.createSession || (ME.documentSession && ME.documentSession.create);

    function listSessions() {
      return sessions.slice();
    }

    function indexOfSession(id) {
      var i;

      for (i = 0; i < sessions.length; i += 1) {
        if (sessions[i].id === id) {
          return i;
        }
      }

      return -1;
    }

    function hasSession(id) {
      return indexOfSession(id) !== -1;
    }

    function getSession(id) {
      var index = indexOfSession(id);

      return index === -1 ? null : sessions[index];
    }

    function getActiveSession() {
      return activeSessionId ? getSession(activeSessionId) : null;
    }

    function addSession(session, addOptions) {
      if (!session || !session.id) {
        throw new Error("A tab session needs an id.");
      }

      if (hasSession(session.id)) {
        throw new Error("A tab session with this id already exists.");
      }

      sessions.push(session);
      if (!addOptions || addOptions.activate !== false) {
        activeSessionId = session.id;
      }
      return session;
    }

    function setActiveSession(id) {
      var sessionId = typeof id === "string" ? id : id && id.id;

      if (!hasSession(sessionId)) {
        return null;
      }

      activeSessionId = sessionId;
      return getSession(activeSessionId);
    }

    function untitledTitle(typeId) {
      var existingTitles = sessions.map(function (session) {
        return session.title;
      });
      var index = 1;
      var defaultTitle = ME.documentType && ME.documentType.getDefaultFileName
        ? ME.documentType.getDefaultFileName(typeId || "markdown")
        : "Untitled.md";
      var extensionIndex = defaultTitle.lastIndexOf(".");
      var baseName = extensionIndex === -1 ? defaultTitle : defaultTitle.slice(0, extensionIndex);
      var extension = extensionIndex === -1 ? "" : defaultTitle.slice(extensionIndex);
      var title = defaultTitle;

      while (existingTitles.indexOf(title) !== -1) {
        index += 1;
        title = baseName + "-" + index + extension;
      }

      return title;
    }

    function createUntitledSession(sessionOptions) {
      var optionsForSession = {};
      var key;

      if (typeof createSession !== "function") {
        throw new Error("No document session factory is available.");
      }

      sessionOptions = typeof sessionOptions === "string"
        ? { documentType: sessionOptions }
        : sessionOptions || {};
      for (key in sessionOptions) {
        if (Object.prototype.hasOwnProperty.call(sessionOptions, key)) {
          optionsForSession[key] = sessionOptions[key];
        }
      }

      optionsForSession.documentType = optionsForSession.documentType || "markdown";
      optionsForSession.title = optionsForSession.title || untitledTitle(optionsForSession.documentType);
      optionsForSession.markdownText = optionsForSession.markdownText || "";
      return addSession(createSession(optionsForSession), {
        activate: optionsForSession.activate
      });
    }

    function closeSession(id) {
      var closeIndex = -1;
      var wasActive;

      sessions.some(function (session, index) {
        if (session.id === id) {
          closeIndex = index;
          return true;
        }
        return false;
      });

      if (closeIndex === -1) {
        return null;
      }

      wasActive = activeSessionId === id;
      sessions.splice(closeIndex, 1);

      if (!sessions.length) {
        activeSessionId = null;
        return null;
      }

      if (wasActive) {
        activeSessionId = sessions[Math.min(closeIndex, sessions.length - 1)].id;
      }

      return getActiveSession();
    }

    function clearSessions() {
      sessions = [];
      activeSessionId = null;
    }

    function moveSession(sourceId, targetIndex) {
      var currentIndex;
      var session;

      currentIndex = indexOfSession(sourceId);
      if (currentIndex === -1) {
        return false;
      }

      targetIndex = Number(targetIndex);
      if (!isFinite(targetIndex)) {
        targetIndex = 0;
      }
      targetIndex = Math.floor(targetIndex);
      targetIndex = Math.max(0, Math.min(targetIndex, sessions.length - 1));

      if (currentIndex === targetIndex) {
        return false;
      }

      session = sessions.splice(currentIndex, 1)[0];
      sessions.splice(targetIndex, 0, session);
      return true;
    }

    function handleIdentity(fileHandle) {
      if (!fileHandle) {
        return null;
      }

      return fileHandle.__localDraftAIId || fileHandle.__mockId || fileHandle.id || fileHandle.path || null;
    }

    async function sameFileHandle(leftHandle, rightHandle) {
      var leftIdentity;
      var rightIdentity;

      if (!leftHandle || !rightHandle) {
        return false;
      }

      if (leftHandle === rightHandle) {
        return true;
      }

      leftIdentity = handleIdentity(leftHandle);
      rightIdentity = handleIdentity(rightHandle);
      if (leftIdentity != null && rightIdentity != null && leftIdentity === rightIdentity) {
        return true;
      }

      if (typeof leftHandle.isSameEntry === "function") {
        try {
          if (await leftHandle.isSameEntry(rightHandle)) {
            return true;
          }
        } catch (error) {
          // Try the other handle below before giving up.
        }
      }

      if (typeof rightHandle.isSameEntry === "function") {
        try {
          return await rightHandle.isSameEntry(leftHandle);
        } catch (error) {
          return false;
        }
      }

      return false;
    }

    async function findSessionByFileHandle(fileHandle) {
      var i;

      for (i = 0; i < sessions.length; i += 1) {
        if (await sameFileHandle(sessions[i].fileHandle, fileHandle)) {
          return sessions[i];
        }
      }

      return null;
    }

    return {
      addSession: addSession,
      clearSessions: clearSessions,
      closeSession: closeSession,
      createUntitledSession: createUntitledSession,
      findSessionByFileHandle: findSessionByFileHandle,
      getActiveSession: getActiveSession,
      getSession: getSession,
      hasSession: hasSession,
      indexOfSession: indexOfSession,
      listSessions: listSessions,
      moveSession: moveSession,
      setActiveSession: setActiveSession
    };
  }

  ME.tabManager = {
    create: createTabManager
  };
}());
