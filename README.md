# ScholaTile Education Scheduler

![](public/ScholaTile.png)

A calendar service specialized for managing educational resources, such as classrooms, instructors, and courses.

## Overview

Education Scheduler is designed to streamline the complex scheduling requirements of educational institutions. It provides a highly performant and intuitive interface for managing multi-view timetables and resource allocations.

## Features

  - **Resource Management**: Efficiently manage classrooms, instructors, and course assignments.
  - **Dynamic Timetable**: A responsive grid-based layout supporting multi-period sessions.
  - **High Performance**: Optimized rendering using a lightweight virtual DOM and fine-grained state management.
  - **Internationalization (i18n)**: Built-in support for multiple languages and locales.

## Tech Stack

### Frontend

  - **UI Library**: Preact (Lightweight and fast virtual DOM)
  - **Language**: TypeScript
  - **Layout**: CSS Grid (Native support for multi-period spanning and multi-view layouts)
  - **Date Manipulation**: date-fns, Intl.DateTimeFormat
  - **Internationalization**: i18next

### Backend

  - **Runtime**: Node.js
  - **Database ORM**: Prisma

## Getting Started

### Prerequisites

  - Node.js (Latest LTS recommended)
  - npm or yarn

### Installation

1.  Clone the repository:

    ```bash
    git clone https://github.com/yasumichi/Education-Scheduler.git
    cd Education-Scheduler
    ```

2.  Install dependencies:

    ```bash
    npm install
    ```

3.  Set up the backend:

    ```bash
    cd backend
    npm install
    # Configure your .env file and run migrations
    npx prisma migrate dev
    ```

4.  Run the development server:

    ```bash
    cd ..
    npm run dev
    ```

## Project Structure

  - `src/`: Frontend source code (Preact + TypeScript)
  - `backend/`: Backend source code (Node.js + Prisma)
  - `public/`: Static assets and holiday data

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

