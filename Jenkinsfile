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
