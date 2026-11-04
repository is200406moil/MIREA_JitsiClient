#ifndef CALLCONTROL_H
#define CALLCONTROL_H

#include <QDateTime>
#include <QObject>
#include <QString>
#include <QTimer>

// The ongoing meeting notification and its actions. The notification is
// published on the freedesktop notifications service with the Nemo remote
// action hints; tapping it or its buttons calls the slots below over the
// session bus (service ru.vkr.JitsiAuroraPrototype, the application id, object /call), and
// the meeting page handles the signals.
class CallControl : public QObject
{
    Q_OBJECT
    Q_CLASSINFO("D-Bus Interface", "ru.vkr.JitsiAuroraPrototype.Call")
public:
    explicit CallControl(QObject *parent = nullptr);
    // Registers the object; false when the bus refused it.
    bool registerOnBus();

    // Shows the notification until hideNotification(). It is renewed while
    // shown and expires a minute after the application stops renewing it.
    Q_INVOKABLE void showNotification(const QString &summary, const QString &body,
                                      const QString &muteLabel, const QString &hangupLabel);
    Q_INVOKABLE void hideNotification();
    // The microphone button and the text follow the microphone; the
    // notification is updated in place, silently.
    Q_INVOKABLE void updateNotification(const QString &body, const QString &muteLabel);

public slots:
    Q_SCRIPTABLE void activate();
    Q_SCRIPTABLE void toggleAudio();
    Q_SCRIPTABLE void hangup();

signals:
    void activateRequested();
    void toggleAudioRequested();
    void hangupRequested();

private slots:
    void onNotificationClosed(uint id, uint reason);

private:
    void publish();
    void closeNotification(uint id);
    // The id of the shown notification, kept on disk: it cannot be cleared
    // by the user, so one left by a crashed run is closed on the next start.
    void rememberId(uint id);
    // Closes notifications of this application left from an earlier run,
    // also those the shell restored after a restart under new ids.
    void closeLeftovers();

    bool m_shown = false;
    uint m_id = 0;
    // The notification expires unless renewed: it cannot be removed by the
    // user, so it must go away by itself when the application is gone.
    QTimer m_renew;
    QDateTime m_since;
    QString m_summary;
    QString m_body;
    QString m_muteLabel;
    QString m_hangupLabel;
};

#endif // CALLCONTROL_H
