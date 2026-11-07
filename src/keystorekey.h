#ifndef KEYSTOREKEY_H
#define KEYSTOREKEY_H

#include <QByteArray>
#include <QString>

// A secret computed in the system key store (Aurora Keystore, the USERAPP
// token, through the qca-aurora-pkcs11 plugin). The key lives in the store
// and cannot be read out: the secret is the HMAC-SHA256 of the message under
// that key, so nothing secret is kept in the application's files. The key is
// generated on first use.
//
// Returns 32 bytes, or an empty array and the reason in error when the store
// cannot be used.
QByteArray keystoreSecret(const QByteArray &message, QString *error);

#endif // KEYSTOREKEY_H
