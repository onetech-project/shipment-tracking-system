pipeline {
    agent any

    environment {
        REGISTRY = 'registry.example.com'
        IMAGE_BACKEND  = "${REGISTRY}/shipment-tracker/backend"
        IMAGE_FRONTEND = "${REGISTRY}/shipment-tracker/frontend"
        IMAGE_TAG = "${env.GIT_COMMIT?.take(8) ?: 'latest'}"
    }

    stages {
        stage('Install') {
            steps {
                sh 'npm ci'
            }
        }

        stage('Lint') {
            parallel {
                stage('Lint Backend') {
                    steps {
                        sh 'npm run lint --workspace=apps/backend'
                    }
                }
                stage('Lint Frontend') {
                    steps {
                        sh 'npm run lint --workspace=apps/frontend'
                    }
                }
            }
        }

        stage('Test') {
            parallel {
                stage('Test Backend') {
                    steps {
                        sh 'npm run test --workspace=apps/backend'
                    }
                    post {
                        always {
                            junit allowEmptyResults: true, testResults: 'apps/backend/junit.xml'
                        }
                    }
                }
                stage('Type Check Frontend') {
                    steps {
                        sh 'npm run type-check --workspace=apps/frontend'
                    }
                }
            }
        }

        stage('E2E Tests') {
            when {
                anyOf {
                    branch 'main'
                    branch 'develop'
                    branch '001-auth-rbac-multi-organization'
                }
            }
            environment {
                PLAYWRIGHT_BASE_URL       = 'http://localhost:3000'
                E2E_SUPER_ADMIN_EMAIL     = credentials('e2e-super-admin-email')
                E2E_SUPER_ADMIN_PASSWORD  = credentials('e2e-super-admin-password')
                DATABASE_URL              = credentials('e2e-database-url')
                JWT_SECRET                = credentials('jwt-secret')
                NEXT_PUBLIC_API_URL       = 'http://localhost:4000/api'
            }
            steps {
                // Install frontend dependencies including Playwright
                sh 'npm ci --workspace=apps/frontend'
                // Install Playwright browser binaries (chromium only)
                sh 'npx --prefix apps/frontend playwright install chromium --with-deps'
                // Start backend and frontend in background, wait for readiness
                sh '''
                    npm run start:prod --workspace=apps/backend &
                    BACKEND_PID=$!
                    npm run start --workspace=apps/frontend &
                    FRONTEND_PID=$!
                    # Wait for services to be ready (max 60s each)
                    timeout 60 bash -c "until curl -sf http://localhost:4000/api/health; do sleep 2; done"
                    timeout 60 bash -c "until curl -sf http://localhost:3000; do sleep 2; done"
                    # Run Playwright E2E tests
                    npm run test:e2e --workspace=apps/frontend
                    E2E_EXIT=$?
                    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
                    exit $E2E_EXIT
                '''
            }
            post {
                always {
                    publishHTML(target: [
                        allowMissing: true,
                        alwaysLinkToLastBuild: true,
                        keepAll: true,
                        reportDir: 'apps/frontend/playwright-report',
                        reportFiles: 'index.html',
                        reportName: 'Playwright E2E Report'
                    ])
                    junit allowEmptyResults: true, testResults: 'apps/frontend/test-results/**/*.xml'
                }
            }
        }

        stage('Build') {
            parallel {
                stage('Build Backend') {
                    steps {
                        sh 'npm run build --workspace=apps/backend'
                    }
                }
                stage('Build Frontend') {
                    steps {
                        sh 'npm run build --workspace=apps/frontend'
                    }
                }
            }
        }

        stage('Docker Build & Push') {
            when {
                anyOf {
                    branch 'main'
                    branch 'develop'
                }
            }
            steps {
                script {
                    docker.withRegistry("https://${REGISTRY}", 'registry-credentials') {
                        def backendImage  = docker.build("${IMAGE_BACKEND}:${IMAGE_TAG}",  "-f apps/backend/Dockerfile .")
                        def frontendImage = docker.build("${IMAGE_FRONTEND}:${IMAGE_TAG}", "-f apps/frontend/Dockerfile .")
                        backendImage.push()
                        backendImage.push('latest')
                        frontendImage.push()
                        frontendImage.push('latest')
                    }
                }
            }
        }

        stage('Deploy') {
            when { branch 'main' }
            steps {
                echo "Deploy stage — integrate with your orchestration tool (k8s, docker-compose, etc.)"
            }
        }
    }

    post {
        always {
            cleanWs()
        }
        failure {
            echo 'Build failed — notify team'
        }
    }
}
