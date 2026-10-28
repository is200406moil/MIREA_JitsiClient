TEMPLATE = app
TARGET = jitsi-gst-camera-probe
QT -= gui
CONFIG += console c++11 link_pkgconfig
CONFIG -= app_bundle
PKGCONFIG += gstreamer-1.0 gstreamer-app-1.0
SOURCES += gst-camera-probe.cpp
