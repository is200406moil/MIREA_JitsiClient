#pragma once

#include <QObject>
#include <QHash>
#include <QJsonObject>
#include <QTcpServer>
#include <QVariantList>
#include "storage.h"

// The source of screen sharing frames (ScreenCapture in the application;
// the unit tests run without one).
class ScreenFrameSource
{
public:
    virtual ~ScreenFrameSource() = default;
    virtual bool start() = 0;
    virtual void stop() = 0;
    virtual QString error() const = 0;
    virtual QByteArray frame(quint64 *serial) const = 0;
};

// Saved logins and organizer tokens per server host (CredentialStore over
// the system secure storage in the application; none in the unit tests).
class LoginStore
{
public:
    virtual ~LoginStore() = default;
    virtual QVariantMap load(const QString &host) = 0;
    virtual void update(const QString &host, const QVariantMap &fields) = 0;
};

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
    // Meetings planned in the application (Calendar tab): the system
    // calendar is closed to applications, the Calendar permission is not
    // allowed for them.
    Q_PROPERTY(QVariantList scheduled READ scheduled NOTIFY scheduledChanged)
    Q_PROPERTY(QString meetingUrl READ meetingUrl NOTIFY meetingChanged)
    Q_PROPERTY(QString meetingOrigin READ meetingOrigin NOTIFY meetingChanged)
    Q_PROPERTY(QString lastError READ lastError NOTIFY errorChanged)

public:
    explicit AppState(QObject *parent = nullptr, const QString &settingsFile = QString());
    void setScreenFrameSource(ScreenFrameSource *source) { m_screen = source; }
    // Camera frames from the application (NativeCamera, Aurora OS 5.1).
    void setCameraFrameSource(ScreenFrameSource *source) { m_camera = source; }
    void setLoginStore(LoginStore *store) { m_logins = store; }
    QString displayName() const;
    QString email() const;
    QString avatarUrl() const;
    QString server() const;
    bool audioMuted() const;
    bool videoMuted() const;
    QVariantMap preferences() const;
    QVariantList rooms() const;
    QVariantList scheduled() const { return m_scheduled; }
    QString meetingUrl() const { return m_meetingUrl; }
    QString meetingOrigin() const { return m_meetingOrigin; }
    QString lastError() const { return m_error; }

    Q_INVOKABLE bool saveProfile(const QString &name, const QString &email);
    Q_INVOKABLE bool saveSettings(const QString &server, bool audioMuted, bool videoMuted);
    Q_INVOKABLE bool setPreference(const QString &key, const QVariant &value);
    Q_INVOKABLE QString roomSection(qint64 timestamp) const;
    Q_INVOKABLE QVariantMap saveRoom(const QString &input, bool remember = true);
    Q_INVOKABLE void removeRoom(const QString &id);
    // A planned meeting: the room name or link, a title (the room name when
    // empty), the start (ms since 1970), the length and the reminder (minutes
    // before, 0 for none). False with lastError on a bad room.
    Q_INVOKABLE bool addScheduled(const QString &input, const QString &title, qint64 start, int minutes, int remind);
    Q_INVOKABLE void removeScheduled(const QString &id);
    // Writes the meeting as an iCalendar file (with the reminder) to the
    // Downloads folder for the system calendar to import; its file:// URL,
    // empty with lastError on failure.
    Q_INVOKABLE QString exportScheduled(const QString &id);
    // Puts the first event of an iCalendar file (an invitation) into the
    // planned meetings: its title, time, reminder and the meeting link found
    // in URL, LOCATION or DESCRIPTION. {ok, title, start, link, duplicate},
    // or {ok: false, error}.
    Q_INVOKABLE QVariantMap importCalendarFile(const QString &path);
    // The same for the text of a file (the unit tests).
    QVariantMap importCalendarText(const QString &text);
    Q_INVOKABLE void importLegacy(const QString &json, const QString &name);
    Q_INVOKABLE bool startMeeting(const QVariantMap &room, bool muteAudio, bool muteVideo, bool audioOnly = false);
    Q_INVOKABLE void appendCallLog(const QString &message);
    Q_INVOKABLE void finishMeeting();
    Q_INVOKABLE bool isTrustedOrigin(const QString &origin) const;
    // Screen capture starts only after the user answers in the application's
    // own interface: the call page also runs code of the Jitsi server.
    Q_INVOKABLE bool screenShareWaiting() const { return m_screenShare == ScreenShareWaiting; }
    Q_INVOKABLE QString screenShareTitle() const;
    Q_INVOKABLE QString screenShareText() const;
    Q_INVOKABLE void answerScreenShare(bool allow);
    Q_INVOKABLE QString initials(const QString &name) const;
    // Jitsi Meet strings (qml/call/lang), the same files the call screen uses.
    Q_INVOKABLE QString t(const QString &key, const QVariantMap &params = QVariantMap()) const;
    Q_INVOKABLE QString roomDate(qint64 timestamp) const;
    // The meeting timer of the call page: mm:ss, h:mm:ss after an hour.
    Q_INVOKABLE QString formatDuration(double milliseconds) const;
    Q_INVOKABLE void copyText(const QString &text);

signals:
    void profileChanged();
    void settingsChanged();
    void interfaceLanguageChanged();
    void roomsChanged();
    void scheduledChanged();
    void meetingChanged();
    void errorChanged();
    void conferenceEvent(const QString &name, const QVariantMap &data);

private:
    QString normalizedServer(const QString &input) const;
    void setError(const QString &message);
    void storeRoom(const QVariantMap &room);
    void acceptConnection();
    void handleRequest(class QTcpSocket *socket);
    void sendResponse(class QTcpSocket *socket, int status, const QByteArray &type, const QByteArray &body);
    void markJoined();

    Storage m_store;
    QTcpServer m_http;
    enum ScreenShareState { ScreenShareNone, ScreenShareWaiting, ScreenShareAllowed, ScreenShareRefused };
    ScreenFrameSource *m_screen = nullptr;
    ScreenFrameSource *m_camera = nullptr;
    ScreenShareState m_screenShare = ScreenShareNone;
    LoginStore *m_logins = nullptr;
    QVariantList m_rooms;
    QVariantList m_scheduled;
    void storeScheduled();
    QVariantMap m_activeRoom;
    qint64 m_meetingStarted = 0;
    QByteArray m_meetingHtml;
    QString m_route;
    QString m_meetingUrl;
    QString m_meetingOrigin;
    QString m_error;
    QJsonObject m_strings;
    QJsonObject m_fallbackStrings;
    QJsonObject m_languages;
    void loadStrings();
};
