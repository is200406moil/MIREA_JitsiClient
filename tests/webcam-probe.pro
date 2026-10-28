TEMPLATE = app
TARGET = jitsi-webcam-probe
QT = core gui quick qml network
CONFIG += console c++11 link_pkgconfig
CONFIG -= app_bundle
PKGCONFIG += aurorawebview
SOURCES += webcam-probe.cpp
