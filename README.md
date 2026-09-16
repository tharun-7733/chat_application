# NexChat — Distributed Real-Time Chat System

A production-grade, distributed real-time chat application built as a showcase of scalable architecture, polyglot microservices, and modern web development.

This project is not a simple monolith or CRUD app; it demonstrates the patterns used by platforms like Slack, Discord, and WhatsApp to handle high concurrency, stateful connections, and secure data persistence.

---

## 🌍 The Big Picture

NexChat splits responsibilities across specialized components, forming a distributed system:
- **Node.js (Fastify)** handles the heavy lifting of security, data integrity, and REST APIs.
- **Go** handles the high-concurrency, low-latency WebSocket connections.
- **React** provides a snappy, single-page application experience.
- **Redis** and **MongoDB** handle real-time messaging distribution and persistent storage.

---

## 🏗️ System Architecture

```mermaid
graph TD
    Client[React Frontend] -->|REST / HTTP| Node[Node.js Fastify\nAuth & API Service]
    Client -->|WebSocket| Go[Go WebSocket Engine\nReal-time Relay]
    
    Node -->|Mongoose ODM| Mongo[(MongoDB\nPersistent Storage)]
    Go -->|REST API| Node
    
    Go -->|Pub/Sub| Redis[(Redis\nMessage Broker)]
    
    classDef frontend fill:#61DAFB,stroke:#333,stroke-width:2px,color:black;
    classDef node fill:#68A063,stroke:#333,stroke-width:2px,color:white;
    classDef go fill:#00ADD8,stroke:#333,stroke-width:2px,color:white;
    classDef db fill:#4DB33D,stroke:#333,stroke-width:2px,color:white;
    classDef redis fill:#DC382D,stroke:#333,stroke-width:2px,color:white;
    
    class Client frontend;
    class Node node;
    class Go go;
    class Mongo db;
    class Redis redis;
```

### Component Breakdown

#### 1. React Frontend (Port 5173)
The user interface. It communicates with the Node.js service via standard HTTP REST calls for things like login, registration, and loading chat history. Once authenticated, it opens a persistent WebSocket connection to the Go service to send and receive messages in real-time.

#### 2. Node.js Backend Service (Port 8080)
The "Source of Truth." Responsibilities include:
- **Identity:** User registration, password hashing (BCrypt), and JWT generation (HMAC-SHA256).
- **REST APIs:** Providing endpoints for profile management and paginated chat history.
- **Persistence:** Interacting with MongoDB using Mongoose.
- **Security:** Guarding the system with a stateless middleware chain and Redis rate limiting.

#### 3. Go WebSocket Engine (Port 8081)
The "Real-Time Router." Go is famous for its concurrency model (Goroutines), making it the perfect language for handling tens of thousands of simultaneous WebSocket connections with very low memory overhead. Responsibilities include:
- Maintaining live WebSocket connections.
- Routing messages from a sender immediately to a receiver.
- Broadcasting "user is typing..." or "user is online" events.

#### 4. MongoDB Database (Port 27017)
The permanent storage layer. It holds users, hashed passwords, session refresh tokens, the friendship graph, and every chat message ever sent.

#### 5. Redis Pub/Sub (Port 6379)
The "Scale-Out" layer. If User A is connected to Go Server #1, and User B is connected to Go Server #2, how does a message get from A to B? 
Go Server #1 publishes the message to Redis. Redis broadcasts it to all other Go servers. Go Server #2 sees the message and pushes it down the WebSocket to User B. This allows the system to scale horizontally by running infinite instances of the Go service.

---

## 🔄 Data Flow: Sending a Message

To understand why the system is built this way, let's trace what happens when Alice sends a message to Bob:

1. **Authentication:** Alice logs in via the **Node.js** service and gets a JWT (JSON Web Token).
2. **Connection:** Alice's React app uses that JWT to open a WebSocket connection to the **Go** service.
3. **Dispatch:** Alice types "Hello" and hits send. The message goes over the WebSocket to the **Go** service.
4. **Relay & Persist:** The **Go** service:
   - Immediately routes the message to Bob's WebSocket (if he is online).
   - Publishes the message to **Redis** (in case Bob is connected to a different server instance).
   - Makes a fast, internal HTTP call to the **Node.js** service to save the message into **MongoDB**.
5. **Delivery:** Bob receives the message on his screen instantly. His client sends a "Delivered" receipt back through the WebSocket, updating the database.

---

## 🧠 Key Engineering Patterns

- **Polyglot Engineering:** Using the right tool for the job (Node.js for flexible APIs, Go for high-concurrency I/O).
- **Stateless Auth:** Proper JWT usage with separate short-lived access tokens (15m) and revocable refresh tokens (7d).
- **Horizontal Scalability:** Designing a system that doesn't break when you spin up 5 copies of the server behind a load balancer (thanks to Redis Pub/Sub and stateless APIs).
- **Clean Architecture:** Strict separation of concerns (Models, Repositories, Controllers, Services).
- **API Envelope Pattern:** Consistent, structured JSON responses for every endpoint.

---

## 🛠️ Tech Stack Overview

- **Frontend:** React 18, TailwindCSS, Axios, Native WebSockets, Vite
- **Node.js Backend:** Node.js 22, Fastify, Mongoose, Zod, JsonWebToken, Bcrypt, Vitest
- **Go Backend:** Go (latest), Gin, Gorilla WebSocket, go-redis
- **Data:** MongoDB 7, Redis 7
- **DevOps:** Docker, Docker Compose, GitHub Actions

---

## 🚀 Development Quick Start

The project relies on Docker Compose for infrastructure and a `Makefile` for developer convenience.

### Prerequisites
- Docker & Docker Compose
- Node.js 22+ & npm
- Go 1.22+

### Commands

```bash
# Start the database and redis containers
make db-up

# Stop and remove containers
make db-down

# Compile the Node.js service
make node-build

# Run the Node.js service locally
make node-run

# Run Node unit tests
make node-test

# Clean build artifacts
make clean
```
