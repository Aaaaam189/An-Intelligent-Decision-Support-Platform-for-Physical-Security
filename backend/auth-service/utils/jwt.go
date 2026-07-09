package utils

import (
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"sentinelai/auth-service/models"
)

func GenerateToken(userID uuid.UUID, role models.AppRole, secret string) (string, error) {
	claims := jwt.MapClaims{
		"userId": userID.String(),
		"role":   string(role),
		"exp":    time.Now().Add(24 * time.Hour).Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}