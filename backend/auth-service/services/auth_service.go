package services

import (
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"gorm.io/gorm"

	"sentinelai/auth-service/dto"
	"sentinelai/auth-service/models"
	"sentinelai/auth-service/utils"
)

type AuthService struct {
	DB        *gorm.DB
	JWTSecret string
	SMTP      utils.SMTPConfig
}

func NewAuthService(db *gorm.DB, jwtSecret string, smtp utils.SMTPConfig) *AuthService {
	return &AuthService{DB: db, JWTSecret: jwtSecret, SMTP: smtp}
}

func (s *AuthService) Login(req dto.LoginRequest) (*dto.LoginResponse, error) {
	var user models.User
	if err := s.DB.Where("email = ?", req.Email).First(&user).Error; err != nil {
		return nil, errors.New("invalid credentials")
	}

	if !utils.CheckPassword(user.PasswordHash, req.Password) {
		return nil, errors.New("invalid credentials")
	}

	token, err := utils.GenerateToken(user.ID, user.Role, s.JWTSecret)
	if err != nil {
		return nil, errors.New("failed to generate token")
	}

	return &dto.LoginResponse{
		Token: token,
		User:  dto.ToUserResponse(user),
	}, nil
}

func (s *AuthService) ChangePassword(userID string, req dto.ChangePasswordRequest) error {
	var user models.User
	if err := s.DB.Where("id = ?", userID).First(&user).Error; err != nil {
		return errors.New("user not found")
	}

	if !utils.CheckPassword(user.PasswordHash, req.CurrentPassword) {
		return errors.New("current password is incorrect")
	}

	newHash, err := utils.HashPassword(req.NewPassword)
	if err != nil {
		return errors.New("failed to hash new password")
	}

	user.PasswordHash = newHash
	if err := s.DB.Save(&user).Error; err != nil {
		return errors.New("failed to update password")
	}

	return nil
}

func (s *AuthService) ForgotPassword(req dto.ForgotPasswordRequest) error {
	var user models.User
	if err := s.DB.Where("email = ?", req.Email).First(&user).Error; err != nil {
		// Don't reveal whether the email exists.
		return nil
	}

	code, err := utils.GenerateCode()
	if err != nil {
		return errors.New("failed to generate code")
	}

	resetCode := models.PasswordResetCode{
		UserID:    user.ID,
		Code:      code,
		ExpiresAt: time.Now().Add(15 * time.Minute),
	}
	if err := s.DB.Create(&resetCode).Error; err != nil {
		return errors.New("failed to store reset code")
	}

	body := fmt.Sprintf("Your SentinelAI password reset code is: %s\nIt expires in 15 minutes.", code)
	if err := utils.SendEmail(s.SMTP, user.Email, "Password reset code", body); err != nil {
		return errors.New("failed to send email")
	}

	return nil
}

func (s *AuthService) VerifyResetCode(req dto.VerifyResetCodeRequest) (string, error) {
	var user models.User
	if err := s.DB.Where("email = ?", req.Email).First(&user).Error; err != nil {
		return "", errors.New("invalid code")
	}

	var resetCode models.PasswordResetCode
	err := s.DB.Where("user_id = ? AND code = ? AND used = ? AND expires_at > ?",
		user.ID, req.Code, false, time.Now()).
		Order("created_at desc").
		First(&resetCode).Error
	if err != nil {
		return "", errors.New("invalid or expired code")
	}

	resetCode.Used = true
	s.DB.Save(&resetCode)

	claims := jwt.MapClaims{
		"userId":  user.ID.String(),
		"purpose": "password_reset",
		"exp":     time.Now().Add(10 * time.Minute).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	resetToken, err := token.SignedString([]byte(s.JWTSecret))
	if err != nil {
		return "", errors.New("failed to generate reset token")
	}

	return resetToken, nil
}

func (s *AuthService) ResetPassword(req dto.ResetPasswordRequest) error {
	token, err := jwt.Parse(req.ResetToken, func(t *jwt.Token) (interface{}, error) {
		return []byte(s.JWTSecret), nil
	})
	if err != nil || !token.Valid {
		return errors.New("invalid or expired reset token")
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok || claims["purpose"] != "password_reset" {
		return errors.New("invalid reset token")
	}

	userID, _ := claims["userId"].(string)

	var user models.User
	if err := s.DB.Where("id = ?", userID).First(&user).Error; err != nil {
		return errors.New("user not found")
	}

	newHash, err := utils.HashPassword(req.NewPassword)
	if err != nil {
		return errors.New("failed to hash password")
	}

	user.PasswordHash = newHash
	return s.DB.Save(&user).Error
}