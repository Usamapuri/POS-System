package fiscal

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
)

// MockStrategy returns deterministic dummy IRN and QR text.
type MockStrategy struct{}

func (MockStrategy) Fiscalize(_ context.Context, in FiscalOrderInput) (FiscalResult, error) {
	h := sha256.Sum256([]byte(in.OrderID.String() + "|" + in.OrderNumber))
	short := hex.EncodeToString(h[:8])
	irn := fmt.Sprintf("MOCK-IRN-%s-%s", in.OrderNumber, short)
	qr := fmt.Sprintf("https://bhookly.app/fiscal/verify?irn=%s&usin=%s", irn, in.USIN)
	return FiscalResult{
		Status:      StatusSynced,
		IRN:         irn,
		QrCodeValue: qr,
		Authority:   AuthorityMock,
		RawResponse: `{"mock":true}`,
	}, nil
}
