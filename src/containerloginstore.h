#ifndef CONTAINERLOGINSTORE_H
#define CONTAINERLOGINSTORE_H

#include <QObject>
#include <QJsonObject>
#include <QVariantMap>
#include "appstate.h"

class QDBusInterface;

// Logins and organizer tokens of Jitsi servers in the application's crypto
// container (SecureStorage permission, system service ru.omprussia.sstore,
// as in the Aurora OS Secret Keeper example). The container is an encrypted
// directory; the entries are kept in a JSON file inside it.
//
// The container password comes from the system key store (keystorekey.h), so
// the user never types it (the meeting must open without asking for anything
// again) and no secret lies next to the data. A container of an earlier
// version, with its password in storage.key, is recrypted once. If the key
// store cannot be used, the file stays in use and the journal says so. A
// container whose key is in the store is never replaced when the store does
// not answer: it stays closed until the next start.
//
// KNOWN LIMITATION: sstore passes the container password on the securefs
// command line, where it shows in the system journal.
class ContainerLoginStore : public QObject, public LoginStore
{
    Q_OBJECT
public:
    explicit ContainerLoginStore(QObject *parent = nullptr);
    ~ContainerLoginStore() override;

    QVariantMap load(const QString &host) override;
    void update(const QString &host, const QVariantMap &fields) override;

signals:
    void message(const QString &text);

private:
    bool open();
    QString fileKey(bool create);
    QString chooseKey(bool exists);
    void markKeyInStore();
    QJsonObject readEntries() const;
    void writeEntries(const QJsonObject &entries);

    QDBusInterface *m_sstore;
    QString m_path;
    // The store did not answer for a container that needs it; asking again
    // would keep the interface waiting at every meeting.
    bool m_storeFailed = false;
};

#endif // CONTAINERLOGINSTORE_H
