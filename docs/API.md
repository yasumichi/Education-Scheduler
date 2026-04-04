# API Documentation

This document outlines the available backend API endpoints for the Education Scheduler.

## Base URL

All API endpoints are prefixed with `/api`. The base URL is typically `http://localhost:3001` during development, but this can be configured via environment variables.

## Authentication

Most endpoints require authentication using JWT tokens. The token should be passed in the `Authorization` header as `Bearer <token>`.

## Endpoints

### Authentication

#### `POST /api/auth/register`
Registers a new user.

*   **Request Body**:
    *   `email` (string, required)
    *   `password` (string, required)
    *   `role` (string, optional, defaults to 'STUDENT')

#### `POST /api/auth/login`
Authenticates a user and returns a JWT token.

*   **Request Body**:
    *   `email` (string, required)
    *   `password` (string, required)
*   **Response Body**:
    *   `token` (string): JWT token for authentication.
    *   `user` (object): User details (`id`, `email`, `role`).

### General Endpoints

#### `GET /api/health`
Checks the health of the backend server.

*   **Response Body**:
    *   `status` (string): 'ok'
    *   `message` (string): Server status message.

### Resource Management (Admin Only)

These endpoints require `ADMIN` role and a valid JWT token.

#### `GET /api/resources`
Fetches all resources (rooms, teachers, courses).

*   **Authentication**: Required (JWT).
*   **Response Body**: Array of `Resource` objects. Includes `subjects` for courses and relation IDs for `defaultSubTeachers`.

#### `GET /api/users`
Fetches all users.

*   **Authentication**: Required (JWT, ADMIN role).
*   **Response Body**: Array of user objects (`id`, `email`, `role`).

### Room Management

#### `POST /api/rooms`
Creates or updates a room resource.

*   **Authentication**: Required (JWT, ADMIN role).
*   **Request Body**:
    *   `id` (string, optional): If provided, updates an existing room.
    *   `name` (string, required): The name of the room.
    *   `order` (number, optional): Order for sorting rooms.
*   **Response Body**: The created or updated `Resource` object for the room.

#### `DELETE /api/rooms/:id`
Deletes a room resource.

*   **Authentication**: Required (JWT, ADMIN role).
*   **Path Parameters**:
    *   `id` (string, required): The ID of the room to delete.
*   **Response Body**: `{ message: string }` indicating success.

### Teacher Management

#### `POST /api/teachers`
Creates or updates a teacher resource.

*   **Authentication**: Required (JWT, ADMIN role).
*   **Request Body**:
    *   `id` (string, optional): If provided, updates an existing teacher.
    *   `name` (string, required): The name of the teacher.
    *   `order` (number, optional): Order for sorting teachers.
    *   `userId` (string, optional): The ID of the linked user account.
*   **Response Body**: The created or updated `Resource` object for the teacher.

#### `DELETE /api/teachers/:id`
Deletes a teacher resource.

*   **Authentication**: Required (JWT, ADMIN role).
*   **Path Parameters**:
    *   `id` (string, required): The ID of the teacher to delete.
*   **Response Body**: `{ message: string }` indicating success.

### Course Management (Admin Only)

#### `POST /api/courses`
Creates or updates a course resource.

*   **Authentication**: Required (JWT, ADMIN role).
*   **Request Body**:
    *   `id` (string, optional): If provided, updates an existing course.
    *   `name` (string, required): The name of the course.
    *   `order` (number, optional): Order for sorting courses.
    *   `startDate` (string, optional): Course start date (YYYY-MM-DD).
    *   `endDate` (string, optional): Course end date (YYYY-MM-DD).
    *   `subjects` (array of objects, optional): List of subjects for the course. Each object: `{ name: string, totalPeriods: number }`.
    *   `mainRoomId` (string, optional): ID of the main room for this course (used as default for lessons).
    *   `chiefTeacherId` (string, optional): ID of the chief teacher for this course (informational, not used as default for lessons).
    *   `assistantTeacherIds` (array of strings, optional): IDs of assistant teachers for this course (informational).
    *   `mainTeacherLabel` (string, optional): Custom label for the chief teacher role (e.g., "Professor").
    *   `subTeacherLabel` (string, optional): Custom label for the assistant teacher role (e.g., "TA").
*   **Response Body**: The created or updated `Resource` object for the course.

#### `DELETE /api/courses/:id`
Deletes a course resource.

*   **Authentication**: Required (JWT, ADMIN role).
*   **Path Parameters**:
    *   `id` (string, required): The ID of the course to delete.
*   **Response Body**: `{ message: string }` indicating success.

### Lesson Management

#### `GET /api/lessons`
Fetches all lessons.

*   **Authentication**: Required (JWT).
*   **Response Body**: Array of `Lesson` objects, including `subTeachers` relation.

#### `POST /api/lessons`
Creates or updates a lesson.

*   **Authentication**: Required (JWT, ADMIN role).
*   **Request Body**:
    *   `id` (string, optional): If provided, updates an existing lesson.
    *   `subject` (string, required): The subject of the lesson.
    *   `teacherId` (string, optional): ID of the main teacher.
    *   `subTeacherIds` (array of strings, optional): IDs of sub-teachers.
    *   `roomId` (string, optional): ID of the room.
    *   `courseId` (string, required): ID of the course.
    *   `location` (string, optional): Location if not a specific room (e.g., "Online").
    *   `startDate` (string, required): Start date (YYYY-MM-DD).
    *   `startPeriodId` (string, required): ID of the start time period.
    *   `endDate` (string, required): End date (YYYY-MM-DD).
    *   `endPeriodId` (string, required): ID of the end time period.
*   **Response Body**: The created or updated `Lesson` object.

#### `DELETE /api/lessons/:id`
Deletes a lesson.

*   **Authentication**: Required (JWT, ADMIN role).
*   **Path Parameters**:
    *   `id` (string, required): The ID of the lesson to delete.
*   **Response Body**: `{ message: string }` indicating success.

### Event Management

#### `GET /api/events`
Fetches all schedule events.

*   **Authentication**: Required (JWT).
*   **Response Body**: Array of `ScheduleEvent` objects, including `resources` relation.

#### `POST /api/events`
Creates or updates a schedule event.

*   **Authentication**: Required (JWT, ADMIN role).
*   **Request Body**:
    *   `id` (string, optional): If provided, updates an existing event.
    *   `name` (string, required): The name of the event.
    *   `startDate` (string, required): Start date (YYYY-MM-DD).
    *   `startPeriodId` (string, required): ID of the start time period.
    *   `endDate` (string, required): End date (YYYY-MM-DD).
    *   `endPeriodId` (string, required): ID of the end time period.
    *   `color` (string, optional): Display color for the event.
    *   `showInEventRow` (boolean, optional, defaults to true): Whether to show in the global event row.
    *   `resourceIds` (array of strings, optional): IDs of resources linked to this event.
*   **Response Body**: The created or updated `ScheduleEvent` object.

#### `DELETE /api/events/:id`
Deletes a schedule event.

*   **Authentication**: Required (JWT, ADMIN role).
*   **Path Parameters**:
    *   `id` (string, required): The ID of the event to delete.
*   **Response Body**: `{ message: string }` indicating success.

### Time & Holiday Management

#### `GET /api/holidays`
Fetches all holidays.

*   **Authentication**: Required (JWT).
*   **Response Body**: Array of `Holiday` objects.

#### `GET /api/periods`
Fetches all time periods.

*   **Authentication**: Required (JWT).
*   **Response Body**: Array of `TimePeriod` objects.

#### `POST /api/periods`
Updates all time periods. Expects an array of period objects.

*   **Authentication**: Required (JWT, ADMIN role).
*   **Request Body**:
    *   `periods` (array of objects, required): Array of period objects. Each object: `{ name: string, startTime: string (HH:mm), endTime: string (HH:mm) }`.
*   **Response Body**: The updated array of `TimePeriod` objects.

### Label Management (Admin Only)

#### `GET /api/labels`
Fetches the current resource labels.

*   **Authentication**: Required (JWT).
*   **Response Body**: `ResourceLabels` object.

#### `POST /api/labels`
Updates the resource labels.

*   **Authentication**: Required (JWT, ADMIN role).
*   **Request Body**:
    *   `labels` (object, required): An object containing the labels to update (e.g., `room`, `teacher`, `course`, `event`, `mainTeacher`, `subTeacher`, `mainRoom`).
*   **Response Body**: The updated `ResourceLabels` object.
