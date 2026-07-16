(function () {
  "use strict";

  var ME = window.MarkdownEditor = window.MarkdownEditor || {};

  function normalizeState(value) {
    var allowed = [
      "disconnected",
      "connecting",
      "waiting-for-host-key",
      "waiting-for-secret",
      "connected",
      "reconnecting",
      "closing",
      "error"
    ];
    var state = String(value || "disconnected");

    return allowed.indexOf(state) >= 0 ? state : "error";
  }

  function describe(state) {
    var bridgeAvailable = Boolean(state && state.bridgeAvailable);
    var protocolError = String(state && state.protocolError || "");
    var connectionId = String(state && state.connectionId || "");
    var label = String(state && state.label || connectionId || "Remote host");
    var connectionState = normalizeState(state && state.state);
    var display;
    var accessible;

    if (protocolError) {
      return {
        accessibleLabel: "Remote connection: LocalDraft Bridge error. " + protocolError,
        displayLabel: ">< SSH: Error",
        state: "error",
        title: protocolError
      };
    }
    if (!bridgeAvailable || !connectionId) {
      return {
        accessibleLabel: bridgeAvailable
          ? "Remote connection: Local mode. LocalDraft Bridge is ready."
          : "Remote connection: Local mode. LocalDraft Bridge is unavailable.",
        displayLabel: ">< Local",
        state: bridgeAvailable ? "local-ready" : "local",
        title: bridgeAvailable
          ? "Local mode — select to connect with SSH"
          : "Local mode — remote SSH requires the LocalDraft Bridge"
      };
    }

    if (connectionState === "connected") {
      display = ">< SSH: " + label;
      accessible = "Remote connection: SSH " + label + ", connected";
    } else if (connectionState === "connecting" || connectionState === "waiting-for-host-key" || connectionState === "waiting-for-secret") {
      display = ">< SSH: Connecting…";
      accessible = "Remote connection: SSH " + label + ", connecting";
    } else if (connectionState === "reconnecting") {
      display = ">< SSH: Reconnecting…";
      accessible = "Remote connection: SSH " + label + ", reconnecting";
    } else if (connectionState === "error") {
      display = ">< SSH: Error";
      accessible = "Remote connection: SSH " + label + ", error";
    } else {
      display = ">< SSH: Disconnected";
      accessible = "Remote connection: SSH " + label + ", disconnected";
    }

    return {
      accessibleLabel: accessible,
      displayLabel: display,
      state: connectionState,
      title: accessible
    };
  }

  function commandAvailability(state) {
    var bridgeAvailable = Boolean(state && state.bridgeAvailable && !state.protocolError);
    var connectionId = String(state && state.connectionId || "");
    var connectionState = normalizeState(state && state.state);
    var connected = Boolean(bridgeAvailable && connectionId && connectionState === "connected");
    var busy = connectionState === "connecting" || connectionState === "reconnecting" ||
      connectionState === "waiting-for-host-key" || connectionState === "waiting-for-secret" || connectionState === "closing";

    return {
      "remote.closeConnection": Boolean(bridgeAvailable && connectionId && connectionState !== "disconnected" && connectionState !== "closing"),
      "remote.connectHost": bridgeAvailable && !busy,
      "remote.manageConnections": bridgeAvailable && !busy,
      "remote.openFolder": connected,
      "remote.reconnect": Boolean(bridgeAvailable && connectionId && (connectionState === "disconnected" || connectionState === "error")),
      "remote.showLog": bridgeAvailable
    };
  }

  function create(context) {
    context = context || {};
    var button = context.button;
    var menu = context.menu;
    var onCommand = context.onCommand || function () {};
    var state = {
      bridgeAvailable: false,
      connectionId: "",
      label: "",
      protocolError: "",
      state: "disconnected"
    };

    function positionMenu() {
      var rect;

      if (!button || !menu || menu.hidden) {
        return;
      }
      rect = button.getBoundingClientRect();
      menu.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8)) + "px";
      menu.style.bottom = Math.max(8, window.innerHeight - rect.top + 4) + "px";
    }

    function render() {
      var view = describe(state);
      var availability = commandAvailability(state);

      if (button) {
        button.textContent = view.displayLabel;
        button.dataset.state = view.state;
        button.title = view.title;
        button.setAttribute("aria-label", view.accessibleLabel);
      }
      if (menu) {
        Array.prototype.slice.call(menu.querySelectorAll("[data-remote-command]")).forEach(function (item) {
          var commandId = item.getAttribute("data-remote-command");

          item.disabled = availability[commandId] === false;
        });
      }
      return view;
    }

    function closeMenu() {
      if (!menu || !button) {
        return;
      }
      menu.hidden = true;
      button.setAttribute("aria-expanded", "false");
    }

    function openMenu() {
      if (!menu || !button) {
        return;
      }
      render();
      menu.hidden = false;
      button.setAttribute("aria-expanded", "true");
      positionMenu();
    }

    function bindEvents() {
      if (!button || !menu) {
        return;
      }
      button.addEventListener("click", function (event) {
        event.stopPropagation();
        if (menu.hidden) {
          openMenu();
        } else {
          closeMenu();
        }
      });
      menu.addEventListener("click", function (event) {
        var target = event.target.closest("[data-remote-command]");

        if (!target || target.disabled) {
          return;
        }
        closeMenu();
        onCommand(target.getAttribute("data-remote-command"));
      });
      document.addEventListener("pointerdown", function (event) {
        if (!menu.hidden && !menu.contains(event.target) && event.target !== button) {
          closeMenu();
        }
      });
      document.addEventListener("keydown", function (event) {
        if (event.key === "Escape" && !menu.hidden) {
          closeMenu();
          button.focus();
        }
      });
      window.addEventListener("resize", positionMenu);
    }

    function setBridgeAvailable(available) {
      state.bridgeAvailable = Boolean(available);
      if (available) {
        state.protocolError = "";
      }
      return render();
    }

    function setBridgeError(error) {
      state.bridgeAvailable = false;
      state.protocolError = String(error && error.message || error || "The LocalDraft Bridge is unavailable.");
      return render();
    }

    function setConnection(next) {
      next = next || {};
      state.connectionId = String(next.connectionId != null ? next.connectionId : state.connectionId || "");
      state.label = String(next.label != null ? next.label : state.label || "");
      state.state = normalizeState(next.state != null ? next.state : state.state);
      return render();
    }

    render();
    return {
      bindEvents: bindEvents,
      closeMenu: closeMenu,
      getCommandAvailability: function () { return commandAvailability(state); },
      getState: function () { return Object.assign({}, state); },
      openMenu: openMenu,
      render: render,
      setBridgeAvailable: setBridgeAvailable,
      setBridgeError: setBridgeError,
      setConnection: setConnection
    };
  }

  ME.remoteStatus = {
    commandAvailability: commandAvailability,
    create: create,
    describe: describe,
    normalizeState: normalizeState
  };
}());
