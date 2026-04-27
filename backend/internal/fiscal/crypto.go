package fiscal

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"io"
	"os"
)

// Key material for AES-256-GCM; load from FISCAL_SECRETS_KEY (32-byte raw or base64).
func loadAESKey() ([]byte, error) {
	s := os.Getenv("FISCAL_SECRETS_KEY")
	if s == "" {
		sum := sha256.Sum256([]byte("bhookly-fiscal-dev-only-insecure"))
		return sum[:], nil
	}
	if raw, err := base64.StdEncoding.DecodeString(s); err == nil && len(raw) == 32 {
		return raw, nil
	}
	if len(s) >= 32 {
		sum := sha256.Sum256([]byte(s))
		return sum[:], nil
	}
	padded := s + string(make([]byte, 32-len(s)))
	return []byte(padded)[:32], nil
}

// EncryptAPIKey returns base64(nonce|ciphertext) for storage in JSON.
func EncryptAPIKey(plaintext string) (string, error) {
	if plaintext == "" {
		return "", nil
	}
	key, err := loadAESKey()
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	out := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(out), nil
}

// DecryptAPIKey reverses EncryptAPIKey.
func DecryptAPIKey(b64 string) (string, error) {
	if b64 == "" {
		return "", nil
	}
	raw, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		return "", err
	}
	key, err := loadAESKey()
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	ns := gcm.NonceSize()
	if len(raw) < ns {
		return "", errors.New("ciphertext too short")
	}
	pt, err := gcm.Open(nil, raw[:ns], raw[ns:], nil)
	if err != nil {
		return "", err
	}
	return string(pt), nil
}
