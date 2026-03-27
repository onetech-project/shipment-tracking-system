pipeline {
    agent any

    tools {
        nodejs 'NodeJS 24'
    }

    parameters {
        choice(
            name: 'TARGET_ENV',
            choices: ['staging', 'production'],
            description: 'Target environment for deployment'
        )
        string(
            name: 'GIT_BRANCH',
            defaultValue: '',
            description: 'Git branch to build (leave empty to use environment default)'
        )
    }

    options {
        skipDefaultCheckout(true)
        buildDiscarder(logRotator(numToKeepStr: '10'))
        timeout(time: 30, unit: 'MINUTES')
        timestamps()
        disableConcurrentBuilds()
    }

    environment {
        // Common Configuration
        GIT_CREDENTIALS_ID = 'github-pat-credentials'
        BACKEND_IMAGE_NAME = 'sts-backend'
        FRONTEND_IMAGE_NAME = 'sts-frontend'
    }

    stages {
        stage('Debug Params') {
            steps {
                script {
                    echo "params = ${params}"
                }
            }
        }

        stage('Setup Environment') {
            steps {
                script {
                    def resolvedBranch = params.GIT_BRANCH?.trim()

                    if (!resolvedBranch) {
                        switch(params.TARGET_ENV) {
                            case 'staging':
                                resolvedBranch = 'development'
                                break
                            case 'production':
                                resolvedBranch = 'main'
                                break
                            default:
                                error "Unknown environment: ${params.TARGET_ENV}"
                        }
                    }

                    // assign once, explicit
                    env.BRANCH_NAME = resolvedBranch
                    env.DOCKER_IMAGE_TAG = params.TARGET_ENV
                    env.COMPOSE_DIR = "/var/sts-app/${params.TARGET_ENV}"
                    env.COMPOSE_FILE = 'docker-compose.yml'
                    env.BACKEND_SERVICE_NAME = params.TARGET_ENV == 'staging' ? 'stg-backend' : 'prod-backend'
                    env.FRONTEND_SERVICE_NAME = params.TARGET_ENV == 'staging' ? 'stg-frontend' : 'prod-frontend'
                    env.NEXT_PUBLIC_API_URL = params.TARGET_ENV == 'staging' ? 'https://staging.ekasatyapuspita.com/api' : 'https://ekasatyapuspita.com/api'

                    echo """
                    ====================================
                    Deployment Configuration
                    ====================================
                    Environment: ${params.TARGET_ENV}
                    Branch: ${env.BRANCH_NAME}
                    Backend Image: ${env.BACKEND_IMAGE_NAME}:${env.DOCKER_IMAGE_TAG}
                    Frontend Image: ${env.FRONTEND_IMAGE_NAME}:${env.DOCKER_IMAGE_TAG}
                    Compose Dir: ${env.COMPOSE_DIR}
                    Backend Service Name: ${env.BACKEND_SERVICE_NAME}
                    Frontend Service Name: ${env.FRONTEND_SERVICE_NAME}
                    Public API URL: ${env.NEXT_PUBLIC_API_URL}
                    ====================================
                    """
                }
            }
        }

        stage('Checkout') {
            steps {
                script {
                    def repoUrl = scm?.userRemoteConfigs?.getAt(0)?.url
                    if (!repoUrl) {
                        error 'Cannot determine repository URL from SCM. Configure "Pipeline script from SCM".'
                    }

                    def gitConfig = [url: repoUrl]
                    if (env.GIT_CREDENTIALS_ID?.trim()) {
                        gitConfig.credentialsId = env.GIT_CREDENTIALS_ID
                    }
                    
                    echo "Checking out branch: ${env.BRANCH_NAME}"
                    checkout([
                        $class: 'GitSCM',
                        branches: [[name: "*/${env.BRANCH_NAME}"]],
                        userRemoteConfigs: [gitConfig]
                    ])
                }
            }
        }

        stage('Install') {
            steps {
                sh 'npm ci --no-audit --no-fund --prefer-offline --progress=false --verbose'
            }
        }

        // stage('Lint') {
        //     parallel {
        //         stage('Lint Backend') {
        //             steps {
        //                 sh 'npm run lint --workspace=apps/backend'
        //             }
        //         }
        //         stage('Lint Frontend') {
        //             steps {
        //                 sh 'npm run lint --workspace=apps/frontend'
        //             }
        //         }
        //     }
        // }

        // stage('Test') {
        //     parallel {
        //         stage('Test Backend') {
        //             steps {
        //                 sh 'npm run test --workspace=apps/backend'
        //             }
        //             post {
        //                 always {
        //                     junit allowEmptyResults: true, testResults: 'apps/backend/junit.xml'
        //                 }
        //             }
        //         }
        //         stage('Type Check Frontend') {
        //             steps {
        //                 sh 'npm run type-check --workspace=apps/frontend'
        //             }
        //         }
        //     }
        // }

        // stage('E2E Tests') {
        //     when {
        //         anyOf {
        //             branch 'main'
        //             branch 'develop'
        //             branch '001-auth-rbac-multi-organization'
        //         }
        //     }
        //     environment {
        //         PLAYWRIGHT_BASE_URL       = 'http://localhost:3000'
        //         E2E_SUPER_ADMIN_EMAIL     = credentials('e2e-super-admin-email')
        //         E2E_SUPER_ADMIN_PASSWORD  = credentials('e2e-super-admin-password')
        //         DATABASE_URL              = credentials('e2e-database-url')
        //         JWT_SECRET                = credentials('jwt-secret')
        //         NEXT_PUBLIC_API_URL       = 'http://localhost:4000/api'
        //     }
        //     steps {
        //         // Install frontend dependencies including Playwright
        //         sh 'npm ci --workspace=apps/frontend'
        //         // Install Playwright browser binaries (chromium only)
        //         sh 'npx --prefix apps/frontend playwright install chromium --with-deps'
        //         // Start backend and frontend in background, wait for readiness
        //         sh '''
        //             npm run start:prod --workspace=apps/backend &
        //             BACKEND_PID=$!
        //             npm run start --workspace=apps/frontend &
        //             FRONTEND_PID=$!
        //             # Wait for services to be ready (max 60s each)
        //             timeout 60 bash -c "until curl -sf http://localhost:4000/api/health; do sleep 2; done"
        //             timeout 60 bash -c "until curl -sf http://localhost:3000; do sleep 2; done"
        //             # Run Playwright E2E tests
        //             npm run test:e2e --workspace=apps/frontend
        //             E2E_EXIT=$?
        //             kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
        //             exit $E2E_EXIT
        //         '''
        //     }
        //     post {
        //         always {
        //             publishHTML(target: [
        //                 allowMissing: true,
        //                 alwaysLinkToLastBuild: true,
        //                 keepAll: true,
        //                 reportDir: 'apps/frontend/playwright-report',
        //                 reportFiles: 'index.html',
        //                 reportName: 'Playwright E2E Report'
        //             ])
        //             junit allowEmptyResults: true, testResults: 'apps/frontend/test-results/**/*.xml'
        //         }
        //     }
        // }

        stage('Build Docker Image') {
            parallel {
                stage('Build Backend Image') {
                    steps {
                        script {
                            echo "Building Docker image for backend: ${env.BACKEND_IMAGE_NAME}:${env.DOCKER_IMAGE_TAG}"
                            sh """
                                set -euo pipefail
                                
                                # Build backend Docker image
                                docker build -t ${env.BACKEND_IMAGE_NAME}:${env.DOCKER_IMAGE_TAG} -f apps/backend/Dockerfile .
                                
                                # Verify image was created
                                docker images ${env.BACKEND_IMAGE_NAME}:${env.DOCKER_IMAGE_TAG}
                                
                                echo "Backend Docker image build successful!"
                            """
                        }
                    }
                }
                stage('Build Frontend Image') {
                    steps {
                        script {
                            echo "Building Docker image for frontend: ${env.FRONTEND_IMAGE_NAME}:${env.DOCKER_IMAGE_TAG}"
                            sh """
                                set -euo pipefail
                                
                                # Build frontend Docker image
                                docker build -t ${env.FRONTEND_IMAGE_NAME}:${env.DOCKER_IMAGE_TAG} -f apps/frontend/Dockerfile --build-arg NEXT_PUBLIC_API_URL='${env.NEXT_PUBLIC_API_URL}' .
                                
                                # Verify image was created
                                docker images ${env.FRONTEND_IMAGE_NAME}:${env.DOCKER_IMAGE_TAG}
                                
                                echo "Frontend Docker image build successful!"
                            """
                        }
                    }
                }
            }
        }

        stage('Run Migration') {
            steps {
                script {
                    sh """
                        set -euo pipefail
                        
                        # Run database migrations
                        echo "Copying .env file from compose directory..."
                        cp ${env.COMPOSE_DIR}/.env ./apps/backend/.env || true
                    """
                    try {
                        sh 'npm run migration:run'
                    } catch (err) {
                        echo "Migration failed! Reverting..."

                        sh 'npm run migration:revert || true'

                        error("Migration failed and rollback executed")
                    }
                }
            }
        }

        stage('Deploy with Docker Compose') {
            parallel {
                stage('Deploy Backend') {
                    steps {
                        script {
                            echo "Deploying backend service: ${env.BACKEND_SERVICE_NAME}"
                            sh """
                                set -euo pipefail
                                
                                # Navigate to compose directory
                                cd ${env.COMPOSE_DIR}
                                
                                # Pull latest changes for compose file if needed
                                echo "Current directory: \$(pwd)"
                                
                                # Stop and remove old containers
                                docker-compose down ${env.BACKEND_SERVICE_NAME} || true
                                
                                # Start backend service with new image
                                docker-compose up -d ${env.BACKEND_SERVICE_NAME}
                                
                                # Show running containers
                                docker-compose ps ${env.BACKEND_SERVICE_NAME}
                                
                                echo "Backend deployment successful!"
                            """
                        }
                    }
                }
                stage('Deploy Frontend') {
                    steps {
                        script {
                            echo "Deploying frontend service: ${env.FRONTEND_SERVICE_NAME}"
                            sh """
                                set -euo pipefail
                                
                                # Navigate to compose directory
                                cd ${env.COMPOSE_DIR}
                                
                                # Pull latest changes for compose file if needed
                                echo "Current directory: \$(pwd)"
                                
                                # Stop and remove old containers
                                docker-compose down ${env.FRONTEND_SERVICE_NAME} || true
                                
                                # Start frontend service with new image
                                docker-compose up -d ${env.FRONTEND_SERVICE_NAME}
                                
                                # Show running containers
                                docker-compose ps ${env.FRONTEND_SERVICE_NAME}
                                
                                echo "Frontend deployment successful!"
                            """
                        }
                    }
                }
            }
        }
    }

    post {
        success {
            script {
                sh """
                    cd ${env.COMPOSE_DIR}
                    echo ""
                    echo "======================================"
                    echo "✅ Deployment Successful!"
                    echo "======================================"
                    echo "Environment: ${params.TARGET_ENV}"
                    echo "Branch: ${env.BRANCH_NAME}"
                    echo "Build: ${BUILD_NUMBER}"
                    echo "Backend Docker Image: ${env.BACKEND_IMAGE_NAME}:${env.DOCKER_IMAGE_TAG}"
                    echo "Frontend Docker Image: ${env.FRONTEND_IMAGE_NAME}:${env.DOCKER_IMAGE_TAG}"
                    echo ""
                    echo "Running Containers:"
                    docker-compose ps
                    echo "======================================"
                """
            }
        }
        failure {
            script {
                sh """
                    echo ""
                    echo "======================================"
                    echo "❌ Deployment Failed!"
                    echo "======================================"
                    echo "Environment: ${params.TARGET_ENV}"
                    echo "Branch: ${env.BRANCH_NAME}"
                    echo "Build: ${BUILD_NUMBER}"
                    echo ""
                    echo "Container Logs (last 50 lines):"
                    cd ${env.COMPOSE_DIR} || exit 0
                    docker-compose logs ${env.BACKEND_IMAGE_NAME} ${env.FRONTEND_IMAGE_NAME} --tail=50 || true
                    echo "======================================"
                """
            }
        }
        always {
            echo "Cleaning up workspace..."
            cleanWs(cleanWhenNotBuilt: false,
                    deleteDirs: true,
                    disableDeferredWipeout: true,
                    notFailBuild: true)
        }
    }
}
