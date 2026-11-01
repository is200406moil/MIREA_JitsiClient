#pragma once

#include <QObject>
#include <QNetworkAccessManager>
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
    Q_PROPERTY(QVariantMap dialInInfo READ dialInInfo NOTIFY dialInInfoChanged)

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
    QVariantMap dialInInfo() const { return m_dialInInfo; }

    Q_INVOKABLE bool saveProfile(const QString &name, const QString &email);
    Q_INVOKABLE bool saveSettings(const QString &server, bool audioMuted, bool videoMuted);
    Q_INVOKABLE bool setPreference(const QString &key, const QVariant &value);
    Q_INVOKABLE QString roomSection(qint64 timestamp) const;
    Q_INVOKABLE QVariantMap saveRoom(const QString &input, bool remember = true);
    Q_INVOKABLE void removeRoom(const QString &id);
    Q_INVOKABLE void importLegacy(const QString &json, const QString &name);
    Q_INVOKABLE bool startMeeting(const QVariantMap &room, bool muteAudio, bool muteVideo);
    Q_INVOKABLE void finishMeeting();
    Q_INVOKABLE bool isTrustedOrigin(const QString &origin) const;
    Q_INVOKABLE QString initials(const QString &name) const;
    Q_INVOKABLE QString roomDate(qint64 timestamp) const;
    Q_INVOKABLE void copyText(const QString &text);
    Q_INVOKABLE void fetchDialInInfo(const QVariantMap &room);

signals:
    void profileChanged();
    void settingsChanged();
    void interfaceLanguageChanged();
    void roomsChanged();
    void meetingChanged();
    void errorChanged();
    void conferenceEvent(const QString &name, const QVariantMap &data);
    void dialInInfoChanged();

private:
    QString normalizedServer(const QString &input) const;
    void setError(const QString &message);
    void storeRooms();
    void acceptConnection();
    void handleRequest(class QTcpSocket *socket);
    void sendResponse(class QTcpSocket *socket, int status, const QByteArray &type, const QByteArray &body);
    void markJoined();
    void requestDialInEndpoints(const QString &roomName, const QString &serverAddress,
                                const QString &numbersUrl, const QString &codeUrl, int requestId);

    QSettings *m_settings;
    QTcpServer m_http;
    QVariantList m_rooms;
    QVariantMap m_activeRoom;
    qint64 m_meetingStarted = 0;
    QByteArray m_meetingHtml;
    QString m_route;
    QString m_meetingUrl;
    QString m_meetingOrigin;
    QString m_error;
    QNetworkAccessManager m_network;
    QVariantMap m_dialInInfo;
    int m_dialInRequestId = 0;
    int m_dialInPending = 0;
};
