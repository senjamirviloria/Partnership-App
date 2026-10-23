pipeline {
  agent any

  options {
    disableConcurrentBuilds()
    skipDefaultCheckout(true)
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  triggers {
    pollSCM('H/2 * * * *')
  }

  environment {
    GIT_SSH_COMMAND = 'ssh -i /host_ssh/id_ed25519 -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=/root/.ssh/known_hosts'
  }

  stages {
    stage('Checkout production') {
      steps {
        checkout scm
      }
    }

    stage('Deploy production app') {
      steps {
        sh '''#!/bin/sh
set -eu
commit=$(git rev-parse HEAD)
ssh -i /host_ssh/id_ed25519 \
  -o BatchMode=yes \
  -o StrictHostKeyChecking=yes \
  -o UserKnownHostsFile=/root/.ssh/known_hosts \
  sen@192.168.1.107 "deploy $commit"
'''
      }
    }
  }
}
