import QtQuick 2.6
import QtMultimedia 5.6

Item {
    id: preview
    signal unavailable()
    function release() { camera.cameraState = Camera.UnloadedState }

    Camera {
        id: camera
        captureMode: Camera.CaptureViewfinder
        Component.onCompleted: start()
        Component.onDestruction: cameraState = Camera.UnloadedState
        onError: preview.unavailable()
    }
    VideoOutput {
        anchors.fill: parent
        source: camera
        fillMode: VideoOutput.PreserveAspectCrop
    }
}
