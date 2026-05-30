/**
 * NexChat Java Service — Application Entry Point
 *
 * This is the root of the Spring container. @SpringBootApplication bootstraps
 * the entire application: auto-configuration, component scanning, and context creation.
 *
 * Package placement is intentional: com.nexchat is the root, so all sub-packages
 * (controller, service, repository, security, config) are scanned automatically.
 */
package com.nexchat;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class NexChatApplication {

    public static void main(String[] args) {
        SpringApplication.run(NexChatApplication.class, args);
    }
}
