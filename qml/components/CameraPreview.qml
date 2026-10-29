import QtQuick 2.6
import QtMultimedia 5.6

Item {
    id: preview
    signal unavailable()
    property bool released: false
    function release() {
        if (released) return
        released = true
        videoOutput.visible = false
        videoOutput.source = null
        camera.stop()
        camera.cameraState = Camera.UnloadedState
    }

    Camera {
        id: camera
        captureMode: Camera.CaptureViewfinder
        Component.onCompleted: start()
        Component.onDestruction: cameraState = Camera.UnloadedState
        onError: preview.unavailable()
    }
    VideoOutput {
        id: videoOutput
        anchors.fill: parent
        source: camera
        fillMode: VideoOutput.PreserveAspectCrop
    }
}
