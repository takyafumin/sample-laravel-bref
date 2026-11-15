# cfn-lint has no published image: https://github.com/aws-cloudformation/cfn-lint#docker
FROM python:3.13-slim
ARG CFN_LINT_VERSION=1.60.1
RUN pip install --no-cache-dir --root-user-action=ignore --disable-pip-version-check "cfn-lint==${CFN_LINT_VERSION}"
WORKDIR /data
ENTRYPOINT ["cfn-lint"]
