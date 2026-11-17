import QtQuick 2.6
import QtMultimedia 5.6
import QtQuick.Window 2.2

Item {
    id: preview
    clip: true
    signal unavailable()
    // The orientation of the page (Silica Orientation). The viewfinder is
    // upright in the screen's own orientation; when the page turns, the
    // picture is turned back so that it stays upright (as in the meeting,
    // see NativeCameraSource.qml).
    property int pageOrientation: Screen.primaryOrientation
    readonly property int turn: (Screen.angleBetween(Screen.primaryOrientation, pageOrientation) + 360) % 360
    readonly property bool sideways: turn % 180 !== 0
    property bool released: false
    function release() {
        if (released) return
        released = true
        // Unloaded at once and the viewfinder kept: taking the VideoOutput
        // away restarts the camera without a viewfinder (Aurora OS 5.1),
        // which keeps the device from the call page.
        camera.cameraState = Camera.UnloadedState
        videoOutput.visible = false
    }

    Camera {
        id: camera
        captureMode: Camera.CaptureViewfinder
        // The call starts with the front camera (facingMode "user").
        position: Camera.FrontFace
        // The largest mode up to 720p instead of the default one (640x480 on
        // KVADRA_T); set while loaded, before the viewfinder starts.
        property bool configured: false
        Component.onCompleted: cameraState = Camera.LoadedState
        onCameraStatusChanged: {
            if (cameraStatus !== Camera.LoadedStatus || configured || preview.released) return
            configured = true
            var sizes = camera.supportedViewfinderResolutions()
            var best = null
            for (var i = 0; i < sizes.length; i++) {
                if (Math.min(sizes[i].width, sizes[i].height) > 720) continue
                if (!best || sizes[i].width * sizes[i].height > best.width * best.height) best = sizes[i]
            }
            if (best) camera.viewfinder.resolution = Qt.size(best.width, best.height)
            camera.start()
        }
        Component.onDestruction: cameraState = Camera.UnloadedState
        onError: preview.unavailable()
    }
    Item {
        anchors.centerIn: parent
        width: preview.sideways ? preview.height : preview.width
        height: preview.sideways ? preview.width : preview.height
        rotation: preview.turn
        VideoOutput {
            id: videoOutput
            anchors.fill: parent
            source: camera
            fillMode: VideoOutput.PreserveAspectCrop
        }
    }
}
