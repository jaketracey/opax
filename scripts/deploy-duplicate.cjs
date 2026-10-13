// github-script supplies the authenticated client. Receipts identify the actual
// checkout deployed, which can be newer than the workflow event's head_sha.
module.exports = async function duplicateDeploy({github,context,core,exec}) {
  const repo={owner:context.repo.owner,repo:context.repo.repo};
  const {stdout}=await exec.getExecOutput('git',['rev-parse','HEAD']);
  const sha=stdout.trim();
  core.setOutput('sha',sha);
  let skip=false;
  try {
    const {data}=await github.rest.repos.listDeployments({...repo,environment:'production',per_page:100});
    for(const deployment of data) {
      const payload=typeof deployment.payload==='string'?JSON.parse(deployment.payload):deployment.payload;
      if(payload?.workflow!=='deploy.yml' || !/^[a-f0-9]{40}$/.test(deployment.sha) || String(payload.run_id)===String(context.runId)) continue;
      const {data:statuses}=await github.rest.repos.listDeploymentStatuses({...repo,deployment_id:deployment.id,per_page:1});
      const state=statuses[0]?.state;
      if(state!=='success' && state!=='in_progress') continue;
      if(state==='in_progress') {
        const {data:run}=await github.rest.actions.getWorkflowRun({...repo,run_id:payload.run_id});
        if(run.status!=='in_progress' || run.head_branch!=='main' || !run.path?.endsWith('/deploy.yml')) continue;
      }
      const ancestor=await exec.getExecOutput('git',['merge-base','--is-ancestor',sha,deployment.sha],{ignoreReturnCode:true,silent:true});
      if(ancestor.exitCode===0) {
        core.notice(`Skipping checkout ${sha}: ${deployment.sha} is ${state} (deployment ${deployment.id}).`);
        skip=true;break;
      }
    }
  } catch(error) {core.warning(`Could not verify prior deployment; proceeding: ${error.message}`);}
  core.setOutput('skip',String(skip));
  return skip;
};
