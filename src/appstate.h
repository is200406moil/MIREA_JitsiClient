#pragma once

#include <QObject>
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
    Q_INVOKABLE QVariantMap saveRoom(const QString &input);
    Q_INVOKABLE void removeRoom(const QString &id);
    Q_INVOKABLE void importLegacy(const QString &json, const QString &name);
    Q_INVOKABLE bool startMeeting(const QVariantMap &room, bool muteAudio, bool muteVideo);
    Q_INVOKABLE void finishMeeting();
    Q_INVOKABLE bool isTrustedOrigin(const QString &origin) const;
    Q_INVOKABLE QString initials(const QString &name) const;
    Q_INVOKABLE QString roomDate(qint64 timestamp) const;

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
    QByteArray m_meetingHtml;
    QString m_route;
    QString m_meetingUrl;
    QString m_meetingOrigin;
    QString m_error;
};
