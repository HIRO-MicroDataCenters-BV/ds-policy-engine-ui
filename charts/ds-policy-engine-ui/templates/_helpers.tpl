{{- define "ds-policy-engine-ui.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "ds-policy-engine-ui.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{- define "ds-policy-engine-ui.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "ds-policy-engine-ui.labels" -}}
helm.sh/chart: {{ include "ds-policy-engine-ui.chart" . }}
{{ include "ds-policy-engine-ui.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "ds-policy-engine-ui.selectorLabels" -}}
app.kubernetes.io/name: {{ include "ds-policy-engine-ui.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "ds-policy-engine-ui.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "ds-policy-engine-ui.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{- define "ds-policy-engine-ui.namespace" -}}
{{- default .Release.Namespace .Values.namespace }}
{{- end }}
