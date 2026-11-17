import QtQuick 2.6
import QtMultimedia 5.6
import QtQuick.Window 2.2

// The camera of the call page on Aurora OS 5.1 (see src/nativecamera.h). It
// stays under the meeting view; pictures of its viewfinder go to the page
// through nativeCamera.
Item {
    id: source
    property bool configured: false
    // The orientation of the meeting page (Silica Orientation, the same
    // values as Qt.ScreenOrientation); the picture is turned with it so that
    // it stays upright for the others.
    property int pageOrientation: Screen.primaryOrientation
    readonly property bool front: nativeCamera.facing !== "environment"
    // The viewfinder turns the frames by the camera's mounting angle, given
    // by the system for every camera, so they are upright in the screen's
    // own orientation (portrait on KVADRA_T, whose front camera is on the
    // side); only the turn of the screen from it is added.
    readonly property int turn: (Screen.angleBetween(Screen.primaryOrientation, pageOrientation) + 360) % 360
    readonly property bool sideways: turn % 180 !== 0

    // The picture: the viewfinder frames scaled down (by the GPU, in the
    // grab) to the size the server sends.
    readonly property real frameWidth: viewfinder.sourceRect.width > 0 ? viewfinder.sourceRect.width : 640
    readonly property real frameHeight: viewfinder.sourceRect.height > 0 ? viewfinder.sourceRect.height : 480
    readonly property real fit: Math.min(1, nativeCamera.maxHeight / Math.min(frameWidth, frameHeight))
    readonly property int pictureWidth: 2 * Math.round(frameWidth * fit / 2)
    readonly property int pictureHeight: 2 * Math.round(frameHeight * fit / 2)
    width: sideways ? pictureHeight : pictureWidth
    height: sideways ? pictureWidth : pictureHeight

    onTurnChanged: nativeCamera.note("native camera turned " + turn + " (page orientation " + pageOrientation
                                     + ", screen " + Screen.primaryOrientation + ")")
    Component.onCompleted: nativeCamera.note("native camera turned " + turn + " (page orientation " + pageOrientation
                                             + ", screen " + Screen.primaryOrientation + ")")

    // Every camera has its own modes (the rear camera of KVADRA_T goes up to
    // 4224x3136): the largest one within the size the server sends
    // (nativeCamera.maxHeight, the shorter side) is used, and Jitsi scales
    // it down further for the connection.
    function chooseResolution() {
        var sizes = camera.supportedViewfinderResolutions()
        var limit = nativeCamera.maxHeight
        var best = null
        var names = []
        for (var i = 0; i < sizes.length; i++) {
            var size = sizes[i]
            names.push(size.width + "x" + size.height)
            if (Math.min(size.width, size.height) > limit) continue
            if (!best || size.width * size.height > best.width * best.height) best = size
        }
        if (best) camera.viewfinder.resolution = Qt.size(best.width, best.height)
        nativeCamera.note("native camera " + nativeCamera.facing + " modes " + (names.join(" ") || "unknown")
                          + ", limit " + limit + ", using " + (best ? best.width + "x" + best.height : "default"))
    }

    // A camera that does not list its modes opens in its largest one
    // (2592x1944 and 3840x2160 on KVADRA_T). It is not reopened in a smaller
    // mode (the camera may give no frames after that); the GPU scales the
    // pictures down when they are grabbed.

    Camera {
        id: camera
        captureMode: Camera.CaptureViewfinder
        position: source.front ? Camera.FrontFace : Camera.BackFace
        // Loaded first: the modes are known and the resolution is set
        // before the viewfinder starts.
        Component.onCompleted: cameraState = Camera.LoadedState
        onCameraStatusChanged: {
            if (cameraStatus !== Camera.LoadedStatus || source.configured) return
            source.configured = true
            source.chooseResolution()
            camera.start()
        }
        Component.onDestruction: cameraState = Camera.UnloadedState
        onError: nativeCamera.reportError(errorString)
    }

    // The viewfinder mirrors the front camera; the others get the picture
    // as it is (the meeting page mirrors only the own view), turned upright.
    Item {
        id: frame
        anchors.centerIn: parent
        width: source.pictureWidth
        height: source.pictureHeight
        // The front picture is unmirrored below, which reverses the way it
        // has to turn.
        rotation: source.front ? (360 - source.turn) % 360 : source.turn
        VideoOutput {
            id: viewfinder
            anchors.fill: parent
            source: camera
            fillMode: VideoOutput.Stretch
            transform: Scale { origin.x: viewfinder.width / 2; xScale: source.front ? -1 : 1 }
        }
    }

    Timer {
        id: grabTimer
        interval: 66
        repeat: true
        running: camera.cameraStatus === Camera.ActiveStatus
        property bool busy: false
        onTriggered: {
            if (grabTimer.busy) return
            grabTimer.busy = true
            if (!source.grabToImage(function(result) {
                nativeCamera.pushImage(result.image)
                grabTimer.busy = false
            }, Qt.size(source.width, source.height))) grabTimer.busy = false
        }
    }
}
