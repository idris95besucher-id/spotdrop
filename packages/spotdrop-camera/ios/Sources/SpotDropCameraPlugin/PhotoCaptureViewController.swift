// Superseded by `CameraCaptureViewController` (in VideoCaptureViewController.swift),
// which unifies PHOTO and VIDEO into a single AVCaptureSession/controller instead
// of presenting a separate full-screen controller per capture verb — that split
// is what caused VIDEO to visibly open "a second camera" on top of whatever was
// already on screen.
//
// This file is intentionally left as an empty stub rather than deleted outright
// (the assistant's tools could not remove the file from disk in this session).
// It previously defined `PhotoCaptureResult`/`PhotoCaptureOutput`, which now live
// in VideoCaptureViewController.swift as part of `CameraCaptureResult` — keeping
// both definitions here would be a duplicate-symbol build error.
//
// Safe to delete this file manually (e.g. in Xcode/Finder) once the unified
// camera has been verified working on a physical device.
