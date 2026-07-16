# LocalDraft Bridge

`localdraft-bridge` will provide the loopback-only native boundary for optional Remote SSH Workspaces.

```text
LocalDraftAI browser UI
  -> authenticated same-origin JSON-RPC WebSocket
  -> localdraft-bridge on 127.0.0.1
  -> SSH connection
  -> SFTP subsystem
  -> remote workspace root
```

The bridge will serve the unchanged static frontend, keep SSH credentials and host verification out of the browser, and expose only workspace-scoped filesystem operations. No component is installed on the remote host; it needs only OpenSSH, SFTP, and a permitted user account.

Implementation, build, launch, security, configuration, and limitation details will be added as the phased bridge work lands.
