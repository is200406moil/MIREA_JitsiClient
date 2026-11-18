#ifndef FILEOPENER_H
#define FILEOPENER_H

#include <QObject>
#include <QtDBus/qdbusmacros.h>
#include <QStringList>

// Files opened with the application ("Open with" of the Files app, mail
// attachments): the desktop file names this object (X-Maemo-Service,
// X-Maemo-Object-Path, X-Maemo-Method) for the MIME types it takes, and the
// system calls openFile with the paths. Only calendar events (.ics) for now:
// AppState.importCalendarFile puts the meeting into the Calendar tab.
class FileOpener : public QObject
{
    Q_OBJECT
    Q_CLASSINFO("D-Bus Interface", "ru.mirea.JitsiClient")
public:
    explicit FileOpener(QObject *parent = nullptr);
    // Registers /ru/mirea/JitsiClient; before the service name is taken, so
    // that a call that started the application finds the object.
    bool registerOnBus();

    // The files that came before the QML side was ready; taken once.
    Q_INVOKABLE QStringList takePending();

public slots:
    Q_SCRIPTABLE Q_NOREPLY void openFile(const QStringList &files);

signals:
    void fileOpened(const QString &path);

private:
    QStringList m_pending;
    bool m_taken = false;
};

#endif // FILEOPENER_H
