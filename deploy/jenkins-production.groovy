import hudson.plugins.git.BranchSpec
import hudson.plugins.git.GitSCM
import hudson.plugins.git.UserRemoteConfig
import hudson.triggers.SCMTrigger
import jenkins.model.Jenkins
import org.jenkinsci.plugins.workflow.cps.CpsScmFlowDefinition
import org.jenkinsci.plugins.workflow.job.WorkflowJob

// Install as the Partnership init script and apply through Jenkins' admin API.
def instance = Jenkins.get()
def oldJob = instance.getItemByFullName('Partnership-App-develop')
if (oldJob != null) {
  oldJob.setDisabled(true)
  oldJob.save()
}

def jobName = 'Partnership-App-production'
def job = instance.getItemByFullName(jobName)
if (job == null) {
  job = instance.createProject(WorkflowJob, jobName)
}
def repository = new UserRemoteConfig('git@github.com:senjamirviloria/Partnership-App.git', null, null, null)
def scm = new GitSCM([repository], [new BranchSpec('*/production')], false, [], null, null, [])
def definition = new CpsScmFlowDefinition(scm, 'Jenkinsfile')
definition.setLightweight(false)
job.setDefinition(definition)
job.setDisabled(false)
job.setTriggers([new SCMTrigger('H/2 * * * *')])
job.save()
println('Configured Partnership-App-production from production/Jenkinsfile; develop deployment disabled.')
