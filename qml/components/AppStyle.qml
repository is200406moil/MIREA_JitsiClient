pragma Singleton
import QtQuick 2.0
import Sailfish.Silica 1.0

QtObject {
    readonly property color background: Theme.rgba(Theme.highlightDimmerColor, 0.96)
    readonly property color surface: Theme.rgba(Theme.primaryColor, 0.05)
    readonly property color raised: Theme.rgba(Theme.primaryColor, 0.10)
    readonly property color border: Theme.rgba(Theme.primaryColor, 0.18)
    readonly property color text: Theme.primaryColor
    readonly property color muted: Theme.secondaryColor
    readonly property color accent: Theme.highlightBackgroundColor
    readonly property color accentLight: Theme.highlightColor
    readonly property color danger: "#CB354C"
    readonly property color success: "#78DDB0"
}
