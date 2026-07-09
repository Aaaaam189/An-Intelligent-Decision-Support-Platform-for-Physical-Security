package utils

import (
	"fmt"
	"net/smtp"
)

type SMTPConfig struct {
	Host string
	Port string
	User string
	Pass string
	From string
}

func SendEmail(cfg SMTPConfig, to, subject, body string) error {
	auth := smtp.PlainAuth("", cfg.User, cfg.Pass, cfg.Host)

	msg := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\n\r\n%s",
		cfg.From, to, subject, body)

	addr := fmt.Sprintf("%s:%s", cfg.Host, cfg.Port)
	return smtp.SendMail(addr, auth, cfg.From, []string{to}, []byte(msg))
}