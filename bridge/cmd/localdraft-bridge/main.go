package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"net"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"syscall"
	"time"

	"localdraftai/bridge/internal/appserver"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		log.Printf("localdraft-bridge: %v", err)
		os.Exit(1)
	}
}

func run(arguments []string) error {
	if len(arguments) == 0 || arguments[0] != "serve" {
		return errors.New("usage: localdraft-bridge serve [options]")
	}
	flags := flag.NewFlagSet("serve", flag.ContinueOnError)
	listenAddress := flags.String("listen", appserver.DefaultListenAddress, "loopback listen address")
	webRoot := flags.String("web-root", ".", "LocalDraftAI repository web root")
	configDir := flags.String("config-dir", "", "bridge configuration directory")
	noOpen := flags.Bool("no-open", false, "do not open a browser")
	logLevel := flags.String("log-level", "info", "bridge log level")
	unsafeNonLoopback := flags.Bool("unsafe-non-loopback", false, "allow a non-loopback development listener")
	if err := flags.Parse(arguments[1:]); err != nil {
		return err
	}
	if flags.NArg() != 0 {
		return errors.New("unexpected positional arguments")
	}
	if *logLevel != "debug" && *logLevel != "info" && *logLevel != "warn" && *logLevel != "error" {
		return errors.New("log level must be debug, info, warn, or error")
	}
	if err := appserver.ValidateListenAddress(*listenAddress, *unsafeNonLoopback); err != nil {
		return err
	}
	listener, err := net.Listen("tcp", *listenAddress)
	if err != nil {
		return fmt.Errorf("listen: %w", err)
	}
	defer listener.Close()

	server, err := appserver.New(appserver.Config{
		ListenAddress:     listener.Addr().String(),
		WebRoot:           *webRoot,
		ConfigDir:         *configDir,
		UnsafeNonLoopback: *unsafeNonLoopback,
	})
	if err != nil {
		return err
	}
	errCh := make(chan error, 1)
	go func() {
		errCh <- server.Serve(listener)
	}()
	log.Printf("LocalDraft Bridge %s listening at %s", appserver.BridgeVersion, server.Origin())
	if !*noOpen {
		if err := openBrowser(server.StartupURL()); err != nil {
			log.Printf("could not open the browser automatically")
		}
	}

	signals := make(chan os.Signal, 1)
	signal.Notify(signals, os.Interrupt, syscall.SIGTERM)
	defer signal.Stop(signals)
	select {
	case err := <-errCh:
		return err
	case <-signals:
		shutdownContext, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return server.Shutdown(shutdownContext)
	}
}

func openBrowser(target string) error {
	var command *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		command = exec.Command("open", target)
	case "windows":
		command = exec.Command("rundll32", "url.dll,FileProtocolHandler", target)
	default:
		command = exec.Command("xdg-open", target)
	}
	command.Stdout = nil
	command.Stderr = nil
	return command.Start()
}
