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
        /*
         * SpringApplication.run() does 4 things in order:
         * 1. Creates the ApplicationContext (the Spring IoC container)
         * 2. Runs all auto-configuration classes
         * 3. Runs component scanning and registers all beans
         * 4. Starts the embedded Tomcat server on the configured port
         *
         * The returned ConfigurableApplicationContext can be used to
         * programmatically access beans, but we don't need it here.
         */
        SpringApplication.run(NexChatApplication.class, args);
    }
}
