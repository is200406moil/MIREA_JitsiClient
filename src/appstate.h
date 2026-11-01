#pragma once

#include <QObject>
#include <QHash>
#include <QJsonObject>
#include <QSettings>
#include <QTcpServer>
#include <QVariantList>

class AppState : public QObject
{
    Q_OBJECT
    Q_PROPERTY(QString displayName READ displayName NOTIFY profileChanged)
    Q_PROPERTY(QString email READ email NOTIFY profileChanged)
    Q_PROPERTY(QString avatarUrl READ avatarUrl NOTIFY profileChanged)
    Q_PROPERTY(QString server READ server NOTIFY settingsChanged)
    Q_PROPERTY(bool audioMuted READ audioMuted NOTIFY settingsChanged)
    Q_PROPERTY(bool videoMuted READ videoMuted NOTIFY settingsChanged)
    Q_PROPERTY(QVariantMap preferences READ preferences NOTIFY settingsChanged)
    Q_PROPERTY(QVariantList rooms READ rooms NOTIFY roomsChanged)
    Q_PROPERTY(QString meetingUrl READ meetingUrl NOTIFY meetingChanged)
    Q_PROPERTY(QString meetingOrigin READ meetingOrigin NOTIFY meetingChanged)
    Q_PROPERTY(QString lastError READ lastError NOTIFY errorChanged)

public:
    explicit AppState(QObject *parent = nullptr, const QString &settingsFile = QString());
    QString displayName() const;
    QString email() const;
    QString avatarUrl() const;
    QString server() const;
    bool audioMuted() const;
    bool videoMuted() const;
    QVariantMap preferences() const;
    QVariantList rooms() const;
    QString meetingUrl() const { return m_meetingUrl; }
    QString meetingOrigin() const { return m_meetingOrigin; }
    QString lastError() const { return m_error; }

    Q_INVOKABLE bool saveProfile(const QString &name, const QString &email);
    Q_INVOKABLE bool saveSettings(const QString &server, bool audioMuted, bool videoMuted);
    Q_INVOKABLE bool setPreference(const QString &key, const QVariant &value);
    Q_INVOKABLE QString roomSection(qint64 timestamp) const;
    Q_INVOKABLE QVariantMap saveRoom(const QString &input, bool remember = true);
    Q_INVOKABLE void removeRoom(const QString &id);
    Q_INVOKABLE void importLegacy(const QString &json, const QString &name);
    Q_INVOKABLE bool startMeeting(const QVariantMap &room, bool muteAudio, bool muteVideo, bool audioOnly = false);
    Q_INVOKABLE void appendCallLog(const QString &message);
    Q_INVOKABLE void finishMeeting();
    Q_INVOKABLE bool isTrustedOrigin(const QString &origin) const;
    Q_INVOKABLE QString initials(const QString &name) const;
    // Jitsi Meet strings (qml/call/lang), the same files the call screen uses.
    Q_INVOKABLE QString t(const QString &key, const QVariantMap &params = QVariantMap()) const;
    Q_INVOKABLE QString roomDate(qint64 timestamp) const;
    Q_INVOKABLE void copyText(const QString &text);

signals:
    void profileChanged();
    void settingsChanged();
    void interfaceLanguageChanged();
    void roomsChanged();
    void meetingChanged();
    void errorChanged();
    void conferenceEvent(const QString &name, const QVariantMap &data);

private:
    QString normalizedServer(const QString &input) const;
    void setError(const QString &message);
    void storeRooms();
    void acceptConnection();
    void handleRequest(class QTcpSocket *socket);
    void sendResponse(class QTcpSocket *socket, int status, const QByteArray &type, const QByteArray &body);
    void markJoined();

    QSettings *m_settings;
    QTcpServer m_http;
    QVariantList m_rooms;
    QVariantMap m_activeRoom;
    qint64 m_meetingStarted = 0;
    QByteArray m_meetingHtml;
    // Organizer tokens per server host, kept for the lifetime of the app.
    QHash<QString, QString> m_tokens;
    QString m_route;
    QString m_meetingUrl;
    QString m_meetingOrigin;
    QString m_error;
    QJsonObject m_strings;
    QJsonObject m_fallbackStrings;
    QJsonObject m_languages;
    void loadStrings();
};
