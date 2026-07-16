(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};

  function clearSecretInput(input) {
    if (input) {
      input.value = "";
    }
  }

  function parentRemotePath(value) {
    var path = String(value || "").trim().replace(/\/+$/, "");
    var slash;

    if (!path || path === "/") {
      return "/";
    }
    slash = path.lastIndexOf("/");
    return slash <= 0 ? "/" : path.slice(0, slash);
  }

  function profileFromFields(fields, profileId) {
    var port = Number(fields.port && fields.port.value || 22);
    var profile = {
      auth: {
        allowPassword: Boolean(fields.allowPassword && fields.allowPassword.checked),
        identityFile: String(fields.identityFile && fields.identityFile.value || "").trim(),
        useAgent: Boolean(fields.useAgent && fields.useAgent.checked)
      },
      defaultRemotePath: String(fields.defaultRemotePath && fields.defaultRemotePath.value || "").trim(),
      host: String(fields.host && fields.host.value || "").trim(),
      id: String(profileId || ""),
      label: String(fields.label && fields.label.value || "").trim(),
      port: port,
      source: "manual",
      user: String(fields.user && fields.user.value || "").trim()
    };

    if (!profile.label || !profile.host || !profile.user) {
      throw new Error("Connection name, host, and user are required.");
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error("Port must be a number from 1 to 65535.");
    }
    return profile;
  }

  function create(context) {
    context = context || {};
    var status = context.statusController;
    var bridge = null;
    var subscriptions = [];
    var savedProfiles = [];
    var importedProfiles = [];
    var selectedConnectionId = "";
    var activeProfileId = "";
    var formMode = "add";
    var activePrompt = null;
    var connection = {
      connectionId: "",
      label: "",
      state: "disconnected"
    };

    function setOverlay(overlay, open, focusElement) {
      if (!overlay) {
        return;
      }
      overlay.hidden = !open;
      if (open && focusElement && typeof focusElement.focus === "function") {
        window.setTimeout(function () { focusElement.focus(); }, 0);
      }
    }

    function setTextStatus(element, message, kind) {
      if (!element) {
        return;
      }
      element.textContent = String(message || "");
      if (kind) {
        element.dataset.status = kind;
      } else if (element.removeAttribute) {
        element.removeAttribute("data-status");
      }
    }

    function report(message, kind) {
      setTextStatus(context.managerStatus, message, kind);
      if (typeof context.onMessage === "function") {
        context.onMessage(String(message || ""), kind || "");
      }
    }

    function requireBridge() {
      if (!bridge) {
        report("Remote SSH requires LocalDraftAI opened from the LocalDraft Bridge.", "error");
        return false;
      }
      return true;
    }

    function allProfiles() {
      return savedProfiles.concat(importedProfiles);
    }

    function selectedProfile() {
      return allProfiles().filter(function (profile) {
        return profile.id === selectedConnectionId;
      })[0] || null;
    }

    function findProfile(connectionId) {
      return allProfiles().filter(function (profile) {
        return profile.id === connectionId;
      })[0] || null;
    }

    function updateConnection(next) {
      var profile;

      next = next || {};
      connection.connectionId = String(next.connectionId != null ? next.connectionId : connection.connectionId || "");
      profile = findProfile(connection.connectionId);
      connection.label = String(next.label != null ? next.label : profile && profile.label || connection.label || connection.connectionId);
      connection.state = String(next.state || connection.state || "disconnected");
      if (status) {
        status.setConnection(connection);
      }
      updateCommandElements(document);
      return Object.assign({}, connection);
    }

    function renderProfileGroup(element, profiles, emptyLabel) {
      if (!element) {
        return;
      }
      element.textContent = "";
      if (!profiles.length) {
        var empty = document.createElement("p");
        empty.className = "remote-empty-state";
        empty.textContent = emptyLabel;
        element.appendChild(empty);
        return;
      }
      profiles.forEach(function (profile) {
        var button = document.createElement("button");
        var title = document.createElement("span");
        var detail = document.createElement("span");

        button.type = "button";
        button.className = "remote-connection-row";
        button.dataset.connectionId = profile.id;
        button.setAttribute("role", "option");
        button.setAttribute("aria-selected", profile.id === selectedConnectionId ? "true" : "false");
        if (profile.id === selectedConnectionId) {
          button.classList.add("is-selected");
        }
        title.className = "remote-connection-row-title";
        title.textContent = profile.label;
        detail.className = "remote-connection-row-detail";
        detail.textContent = profile.user + "@" + profile.host + ":" + profile.port;
        button.appendChild(title);
        button.appendChild(detail);
        element.appendChild(button);
      });
    }

    function renderProfiles() {
      var selected = selectedProfile();

      renderProfileGroup(context.savedList, savedProfiles, "No saved SSH connections.");
      renderProfileGroup(context.importedList, importedProfiles, "No supported OpenSSH host aliases found.");
      if (context.connectButton) {
        context.connectButton.disabled = !selected;
      }
      if (context.editButton) {
        context.editButton.disabled = !selected || selected.source !== "manual";
      }
      if (context.removeButton) {
        context.removeButton.disabled = !selected || selected.source !== "manual";
      }
    }

    function selectConnection(connectionId) {
      selectedConnectionId = String(connectionId || "");
      renderProfiles();
    }

    async function refreshProfiles() {
      var results;

      if (!requireBridge()) {
        return false;
      }
      setTextStatus(context.managerStatus, "Loading SSH connections…");
      try {
        results = await Promise.all([
          bridge.request("profile.list", {}),
          bridge.request("profile.listOpenSSHHosts", {})
        ]);
        savedProfiles = results[0] && results[0].profiles || [];
        importedProfiles = results[1] && results[1].profiles || [];
        if (!findProfile(selectedConnectionId)) {
          selectedConnectionId = savedProfiles[0] && savedProfiles[0].id || importedProfiles[0] && importedProfiles[0].id || "";
        }
        renderProfiles();
        setTextStatus(context.managerStatus, "");
        return true;
      } catch (error) {
        report(error.message || "Could not load SSH connections.", "error");
        return false;
      }
    }

    function resetForm() {
      Object.keys(context.formFields || {}).forEach(function (key) {
        var field = context.formFields[key];

        if (!field) {
          return;
        }
        if (field.type === "checkbox") {
          field.checked = key === "useAgent" || key === "allowPassword";
        } else if (key === "port") {
          field.value = "22";
        } else {
          field.value = "";
        }
      });
      activeProfileId = "";
    }

    function populateForm(profile) {
      var fields = context.formFields || {};

      fields.label.value = profile.label || "";
      fields.host.value = profile.host || "";
      fields.port.value = String(profile.port || 22);
      fields.user.value = profile.user || "";
      fields.useAgent.checked = Boolean(profile.auth && profile.auth.useAgent);
      fields.identityFile.value = profile.auth && profile.auth.identityFile || "";
      fields.allowPassword.checked = Boolean(profile.auth && profile.auth.allowPassword);
      fields.defaultRemotePath.value = profile.defaultRemotePath || "";
      activeProfileId = profile.id || "";
    }

    function showProfileForm(mode) {
      var profile = selectedProfile();

      formMode = mode === "edit" ? "edit" : "add";
      resetForm();
      if (formMode === "edit") {
        if (!profile || profile.source !== "manual") {
          return;
        }
        populateForm(profile);
      }
      if (context.managerLists) {
        context.managerLists.hidden = true;
      }
      if (context.profileForm) {
        context.profileForm.hidden = false;
      }
      if (context.profileFormTitle) {
        context.profileFormTitle.textContent = formMode === "edit" ? "Edit SSH Connection" : "Add SSH Connection";
      }
      setTextStatus(context.profileFormStatus, "");
      if (context.formFields && context.formFields.label) {
        context.formFields.label.focus();
      }
    }

    function hideProfileForm() {
      if (context.profileForm) {
        context.profileForm.hidden = true;
      }
      if (context.managerLists) {
        context.managerLists.hidden = false;
      }
      clearSecretInput(context.secretInput);
    }

    async function saveProfileForm() {
      var profile;
      var result;

      if (!requireBridge()) {
        return false;
      }
      try {
        profile = profileFromFields(context.formFields || {}, formMode === "edit" ? activeProfileId : "");
      } catch (error) {
        setTextStatus(context.profileFormStatus, error.message, "error");
        return false;
      }
      setTextStatus(context.profileFormStatus, "Saving connection…");
      try {
        result = await bridge.request(formMode === "edit" ? "profile.update" : "profile.create", { profile: profile });
        selectedConnectionId = result.profile.id;
        hideProfileForm();
        await refreshProfiles();
        report("SSH connection saved.", "success");
        return true;
      } catch (error) {
        setTextStatus(context.profileFormStatus, error.message || "Could not save the SSH connection.", "error");
        return false;
      }
    }

    async function removeSelectedProfile() {
      var profile = selectedProfile();

      if (!profile || profile.source !== "manual" || !requireBridge()) {
        return false;
      }
      if (!window.confirm("Remove SSH connection “" + profile.label + "”?")) {
        return false;
      }
      try {
        await bridge.request("profile.remove", { connectionId: profile.id });
        selectedConnectionId = "";
        await refreshProfiles();
        report("SSH connection removed.", "success");
        return true;
      } catch (error) {
        report(error.message || "Could not remove the SSH connection.", "error");
        return false;
      }
    }

    function formatConnectionError(error) {
      var details = error && error.details || {};

      if (error && error.code === "HOST_KEY_CHANGED") {
        return "The SSH host key changed. Expected " + (details.expectedFingerprints || []).join(", ") +
          "; received " + (details.receivedFingerprint || "an unknown fingerprint") + ". Update the bridge-managed host entry before reconnecting.";
      }
      return String(error && error.message || "Could not connect to the SSH host.");
    }

    async function connectConnection(connectionId) {
      var profile = findProfile(connectionId);
      var result;

      if (!profile || !requireBridge()) {
        return false;
      }
      selectedConnectionId = profile.id;
      updateConnection({ connectionId: profile.id, label: profile.label, state: "connecting" });
      setTextStatus(context.managerStatus, "Connecting to " + profile.label + "…");
      try {
        result = await bridge.request("connection.connect", { connectionId: profile.id }, { timeoutMs: 30000 });
        updateConnection(result);
        setTextStatus(context.managerStatus, "Connected to " + profile.label + ".", "success");
        setOverlay(context.managerOverlay, false);
        return true;
      } catch (error) {
        updateConnection({ connectionId: profile.id, label: profile.label, state: "error" });
        report(formatConnectionError(error), "error");
        return false;
      }
    }

    function connectSelected() {
      return connectConnection(selectedConnectionId);
    }

    async function openManager() {
      if (!requireBridge()) {
        return false;
      }
      hideProfileForm();
      setOverlay(context.managerOverlay, true, context.managerDialog);
      await refreshProfiles();
      return true;
    }

    function renderDirectories(entries) {
      if (!context.folderList) {
        return;
      }
      context.folderList.textContent = "";
      (entries || []).forEach(function (entry) {
        var button = document.createElement("button");

        button.type = "button";
        button.className = "remote-directory-row";
        button.dataset.path = entry.path;
        button.textContent = entry.name;
        context.folderList.appendChild(button);
      });
      if (!entries || !entries.length) {
        var empty = document.createElement("p");
        empty.className = "remote-empty-state";
        empty.textContent = "No subdirectories.";
        context.folderList.appendChild(empty);
      }
    }

    async function loadRemoteDirectory(path) {
      var result;

      if (!requireBridge() || !connection.connectionId) {
        return false;
      }
      setTextStatus(context.folderStatus, "Loading folders…");
      try {
        result = await bridge.request("remote.listAbsoluteDirectory", {
          connectionId: connection.connectionId,
          path: String(path || "").trim()
        });
        context.folderPath.value = result.path;
        renderDirectories(result.entries || []);
        setTextStatus(context.folderStatus, "");
        return result;
      } catch (error) {
        setTextStatus(context.folderStatus, error.message || "Could not list the remote folder.", "error");
        return false;
      }
    }

    async function openRemoteFolder() {
      var profile;
      var initialPath;
      var result;

      if (!requireBridge() || connection.state !== "connected") {
        report("Connect to an SSH host before opening a remote folder.", "error");
        return false;
      }
      profile = findProfile(connection.connectionId);
      initialPath = profile && profile.defaultRemotePath || "";
      setOverlay(context.folderOverlay, true, context.folderPath);
      if (!initialPath) {
        try {
          result = await bridge.request("remote.getHomeDirectory", { connectionId: connection.connectionId });
          initialPath = result.path;
        } catch (error) {
          setTextStatus(context.folderStatus, error.message || "Could not find the remote home directory.", "error");
          return false;
        }
      }
      return loadRemoteDirectory(initialPath);
    }

    async function chooseRemoteFolder() {
      var result = await loadRemoteDirectory(context.folderPath.value);

      if (!result) {
        return false;
      }
      try {
        if (typeof context.onRemoteFolderSelected === "function") {
          await context.onRemoteFolderSelected({
            connectionId: connection.connectionId,
            connectionLabel: connection.label,
            path: result.path
          });
        }
        setOverlay(context.folderOverlay, false);
        report("Remote folder ready: " + result.path, "success");
        return true;
      } catch (error) {
        setTextStatus(context.folderStatus, error.message || "Could not open the remote folder.", "error");
        return false;
      }
    }

    async function reconnect() {
      var result;

      if (!requireBridge() || !connection.connectionId) {
        return false;
      }
      updateConnection({ state: "reconnecting" });
      try {
        result = await bridge.request("connection.reconnect", { connectionId: connection.connectionId }, { timeoutMs: 30000 });
        updateConnection(result);
        return true;
      } catch (error) {
        updateConnection({ state: "error" });
        report(formatConnectionError(error), "error");
        return false;
      }
    }

    async function disconnect() {
      var result;

      if (!requireBridge() || !connection.connectionId) {
        return false;
      }
      try {
        result = await bridge.request("connection.disconnect", { connectionId: connection.connectionId });
        updateConnection(result);
        return true;
      } catch (error) {
        report(error.message || "Could not close the SSH connection.", "error");
        return false;
      }
    }

    function showPrompt(params, type) {
      activePrompt = {
        id: String(params.promptId || ""),
        type: type
      };
      clearSecretInput(context.secretInput);
      if (context.promptTitle) {
        context.promptTitle.textContent = type === "host-key" ? "Confirm SSH Host Key" : type === "passphrase" ? "SSH Key Passphrase" : "SSH Password";
      }
      if (context.promptMessage) {
        context.promptMessage.textContent = type === "host-key"
          ? "The authenticity of host “" + String(params.host || connection.label) + "” cannot be established."
          : String(params.message || "Enter the session-only SSH secret.");
      }
      if (context.promptFingerprint) {
        context.promptFingerprint.hidden = type !== "host-key";
        context.promptFingerprint.textContent = type === "host-key"
          ? String(params.algorithm || "SSH host key").toUpperCase() + " fingerprint:\n" + String(params.fingerprint || "")
          : "";
      }
      if (context.secretField) {
        context.secretField.hidden = type === "host-key";
      }
      if (context.promptConfirm) {
        context.promptConfirm.textContent = type === "host-key" ? "Trust and Continue" : "Continue";
      }
      setOverlay(context.promptOverlay, true, type === "host-key" ? context.promptConfirm : context.secretInput);
    }

    async function respondToPrompt(cancelled) {
      var prompt = activePrompt;
      var secret = context.secretInput && context.secretInput.value || "";
      var request;

      if (!prompt || !bridge) {
        clearSecretInput(context.secretInput);
        setOverlay(context.promptOverlay, false);
        return false;
      }
      clearSecretInput(context.secretInput);
      activePrompt = null;
      setOverlay(context.promptOverlay, false);
      request = bridge.request("connection.respondToPrompt", {
        cancel: Boolean(cancelled),
        promptId: prompt.id,
        secret: prompt.type === "host-key" ? "" : secret,
        trust: prompt.type === "host-key" && !cancelled
      });
      secret = "";
      try {
        await request;
        return true;
      } catch (error) {
        report(error.message || "The SSH prompt is no longer active.", "error");
        return false;
      }
    }

    async function showLogs() {
      var result;

      if (!requireBridge()) {
        return false;
      }
      setOverlay(context.logOverlay, true, context.logDialog);
      if (context.logContents) {
        context.logContents.textContent = "Loading connection log…";
      }
      try {
        result = await bridge.request("bridge.getLogs", {});
        if (context.logContents) {
          context.logContents.textContent = (result.entries || []).map(function (entry) {
            return [entry.timestamp, String(entry.level || "").toUpperCase(), entry.category, entry.message].filter(Boolean).join("  ");
          }).join("\n") || "No connection log entries.";
        }
        return true;
      } catch (error) {
        if (context.logContents) {
          context.logContents.textContent = error.message || "Could not load the connection log.";
        }
        return false;
      }
    }

    function updateCommandElements(root) {
      var availability = status ? status.getCommandAvailability() : {};

      if (!root || !root.querySelectorAll) {
        return availability;
      }
      Array.prototype.slice.call(root.querySelectorAll("[data-remote-command]")).forEach(function (element) {
        var commandId = element.getAttribute("data-remote-command");

        element.disabled = availability[commandId] === false;
      });
      return availability;
    }

    function setBridgeClient(client) {
      subscriptions.forEach(function (dispose) { dispose(); });
      subscriptions = [];
      bridge = client || null;
      if (status) {
        status.setBridgeAvailable(Boolean(bridge));
      }
      if (!bridge) {
        updateCommandElements(document);
        return;
      }
      subscriptions.push(bridge.on("connection.stateChanged", updateConnection));
      subscriptions.push(bridge.on("connection.secretPrompt", function (params) {
        showPrompt(params, params.type === "passphrase" ? "passphrase" : "password");
      }));
      subscriptions.push(bridge.on("connection.hostKeyPrompt", function (params) {
        showPrompt(params, "host-key");
      }));
      subscriptions.push(bridge.on("connection.error", function (params) {
        updateConnection({
          connectionId: params.connectionId,
          state: "error"
        });
        report(params.message || "The SSH connection failed.", "error");
      }));
      subscriptions.push(bridge.on("bridge.stateChanged", function (params) {
        if (params && params.state === "disconnected") {
          if (status) {
            status.setBridgeError("The LocalDraft Bridge connection closed.");
          }
          report("The LocalDraft Bridge connection closed.", "error");
          updateCommandElements(document);
        }
      }));
      updateCommandElements(document);
    }

    function setBridgeError(error) {
      bridge = null;
      if (status) {
        status.setBridgeError(error);
      }
      report(error && error.message || "The LocalDraft Bridge is unavailable.", "error");
      updateCommandElements(document);
    }

    function bindList(element) {
      if (!element) {
        return;
      }
      element.addEventListener("click", function (event) {
        var row = event.target.closest("[data-connection-id]");

        if (row) {
          selectConnection(row.dataset.connectionId);
        }
      });
      element.addEventListener("dblclick", function (event) {
        var row = event.target.closest("[data-connection-id]");

        if (row) {
          selectConnection(row.dataset.connectionId);
          connectSelected();
        }
      });
    }

    function bindEvents() {
      bindList(context.savedList);
      bindList(context.importedList);
      if (context.managerClose) context.managerClose.addEventListener("click", function () { setOverlay(context.managerOverlay, false); });
      if (context.managerCancel) context.managerCancel.addEventListener("click", function () { setOverlay(context.managerOverlay, false); });
      if (context.connectButton) context.connectButton.addEventListener("click", connectSelected);
      if (context.addButton) context.addButton.addEventListener("click", function () { showProfileForm("add"); });
      if (context.editButton) context.editButton.addEventListener("click", function () { showProfileForm("edit"); });
      if (context.removeButton) context.removeButton.addEventListener("click", removeSelectedProfile);
      if (context.refreshButton) context.refreshButton.addEventListener("click", refreshProfiles);
      if (context.profileFormSave) context.profileFormSave.addEventListener("click", saveProfileForm);
      if (context.profileFormCancel) context.profileFormCancel.addEventListener("click", hideProfileForm);
      if (context.promptConfirm) context.promptConfirm.addEventListener("click", function () { respondToPrompt(false); });
      if (context.promptCancel) context.promptCancel.addEventListener("click", function () { respondToPrompt(true); });
      if (context.folderClose) context.folderClose.addEventListener("click", function () { setOverlay(context.folderOverlay, false); });
      if (context.folderCancel) context.folderCancel.addEventListener("click", function () { setOverlay(context.folderOverlay, false); });
      if (context.folderOpen) context.folderOpen.addEventListener("click", chooseRemoteFolder);
      if (context.folderUp) context.folderUp.addEventListener("click", function () { loadRemoteDirectory(parentRemotePath(context.folderPath.value)); });
      if (context.folderPath) context.folderPath.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
          event.preventDefault();
          loadRemoteDirectory(context.folderPath.value);
        }
      });
      if (context.folderList) context.folderList.addEventListener("click", function (event) {
        var row = event.target.closest("[data-path]");

        if (row) {
          loadRemoteDirectory(row.dataset.path);
        }
      });
      if (context.logClose) context.logClose.addEventListener("click", function () { setOverlay(context.logOverlay, false); });
      if (context.logDone) context.logDone.addEventListener("click", function () { setOverlay(context.logOverlay, false); });
      document.addEventListener("keydown", function (event) {
        if (event.key !== "Escape") {
          return;
        }
        if (context.promptOverlay && !context.promptOverlay.hidden) {
          event.preventDefault();
          respondToPrompt(true);
        } else if (context.folderOverlay && !context.folderOverlay.hidden) {
          setOverlay(context.folderOverlay, false);
        } else if (context.logOverlay && !context.logOverlay.hidden) {
          setOverlay(context.logOverlay, false);
        } else if (context.managerOverlay && !context.managerOverlay.hidden) {
          setOverlay(context.managerOverlay, false);
        }
      });
    }

    return {
      bindEvents: bindEvents,
      chooseRemoteFolder: chooseRemoteFolder,
      connectSelected: connectSelected,
      disconnect: disconnect,
      getConnection: function () { return Object.assign({}, connection); },
      getProfiles: function () { return { imported: importedProfiles.slice(), saved: savedProfiles.slice() }; },
      openManager: openManager,
      openRemoteFolder: openRemoteFolder,
      reconnect: reconnect,
      refreshProfiles: refreshProfiles,
      setBridgeClient: setBridgeClient,
      setBridgeError: setBridgeError,
      showLogs: showLogs,
      updateCommandElements: updateCommandElements
    };
  }

  ME.remoteConnectionUI = {
    clearSecretInput: clearSecretInput,
    create: create,
    parentRemotePath: parentRemotePath,
    profileFromFields: profileFromFields
  };
}());
