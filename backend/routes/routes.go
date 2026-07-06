package routes

import (
	"internship-go/handlers"
	"net/http"
)

func Register(taskHandler *handlers.TaskHandler) {

	http.HandleFunc("/tasks", taskHandler.GetTasks)
}