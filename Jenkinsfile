pipeline {
  agent any

  options {
    disableConcurrentBuilds()
    timestamps()
  }

  triggers {
    pollSCM('H/2 * * * *')
  }

  environment {
    DEPLOY_DIR = '/deploy/Partnership-App'
    GIT_SSH_COMMAND = 'ssh -i /host_ssh/id_ed25519 -o StrictHostKeyChecking=no'
  }

  stages {
    stage('Sync develop') {
      steps {
        sh '''#!/bin/sh
set -eu
cd "$DEPLOY_DIR"
git fetch origin develop
git checkout -B develop origin/develop
'''
      }
    }

    stage('Verify local deployment files') {
      steps {
        sh '''#!/bin/sh
set -eu
cd "$DEPLOY_DIR"
test -f .env
test -f .env.seed.local
test -f seed-territories.local.json
'''
      }
    }

    stage('Build app image') {
      steps {
        sh '''#!/bin/sh
set -eu
cd "$DEPLOY_DIR"
docker compose build app
'''
      }
    }

    stage('Deploy app stack') {
      steps {
        sh '''#!/bin/sh
set -eu
cd "$DEPLOY_DIR"
docker compose up -d --remove-orphans
docker compose ps
'''
      }
    }
  }
}
