pragma Singleton
import QtQuick 2.0
import Sailfish.Silica 1.0

// Colours and sizes of the Jitsi Meet mobile theme (react/features/base/ui:
// Tokens.ts + jitsiTokens.json). Screens are laid out in dp of a 360 dp wide
// phone and scaled by `dp`, like React Native lays out the Android client.
QtObject {
    readonly property real dp: Screen.width / 360

    // Surfaces
    readonly property color background: "#040404"   // uiBackground
    readonly property color surface: "#141414"      // ui01
    readonly property color raised: "#292929"       // ui02
    readonly property color field: "#3D3D3D"        // ui03
    readonly property color border: "#525252"       // ui04
    readonly property color separator: "#666666"    // ui05
    // Text
    readonly property color text: "#FFFFFF"         // text01
    readonly property color muted: "#C2C2C2"        // text02
    readonly property color inactive: "#858585"     // text03
    readonly property color dark: "#040404"         // text04
    readonly property color error: "#F24D5F"        // textError
    // Actions
    readonly property color accent: "#4687ED"       // action01
    readonly property color accentActive: "#0056E0" // action01Active
    readonly property color secondary: "#E0E0E0"    // action02
    readonly property color danger: "#D83848"       // actionDanger
    readonly property color focus: "#D7E3F9"        // focus01
    readonly property color success: "#189B55"
    readonly property color warning: "#FFD600"      // warning02

    // Typography (rem = 16 dp)
    readonly property int bodyShort: 14
    readonly property int bodyShortLarge: 16
    readonly property int label: 12

    function avatarColor(name) {
        var colors = ["#6A50D3", "#FF9B42", "#DF486F", "#73348C", "#B23683", "#F96E57", "#4380E2", "#238561", "#00A8B3"]
        var initials = appState.initials(name || "")
        var hash = 0
        for (var i = 0; i < initials.length; ++i) hash += initials.charCodeAt(i)
        return colors[hash % colors.length]
    }
}
