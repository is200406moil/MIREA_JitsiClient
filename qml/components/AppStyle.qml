pragma Singleton
import QtQuick 2.0
import Sailfish.Silica 1.0

QtObject {
    readonly property color background: "#040404"
    readonly property color surface: "#141414"
    readonly property color raised: "#292929"
    readonly property color field: "#3D3D3D"
    readonly property color border: "#525252"
    readonly property color text: "#FFFFFF"
    readonly property color muted: "#C2C2C2"
    readonly property color inactive: "#858585"
    readonly property color accent: "#4687ED"
    readonly property color accentLight: "#4687ED"
    readonly property color danger: "#D83848"
    readonly property color success: "#189B55"
    function avatarColor(name) {
        var colors = ["#6A50D3", "#FF9B42", "#DF486F", "#73348C", "#B23683", "#F96E57", "#4380E2", "#238561", "#00A8B3"]
        var initials = appState.initials(name || "")
        var hash = 0
        for (var i = 0; i < initials.length; ++i) hash += initials.charCodeAt(i)
        return colors[hash % colors.length]
    }
}
