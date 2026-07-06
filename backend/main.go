package main

import (
	"fmt"
	"internship-go/config"
	"internship-go/database"
	"internship-go/handlers"
	"internship-go/repositories"
	"internship-go/routes"
	"internship-go/services"
	"net/http"
)

func main() {

	cfg := config.LoadConfig()

	db := database.Connect(cfg)

	taskRepo := repositories.NewTaskRepository(db)

	taskService := services.NewTaskService(taskRepo)

	taskHandler := handlers.NewTaskHandler(taskService)

	routes.Register(taskHandler)

	fmt.Println("Server running on http://localhost:" + cfg.Port)

	http.ListenAndServe(":"+cfg.Port, nil)
}