param(
    [Parameter(Mandatory = $true)][string]$Video,
    [Parameter(Mandatory = $true)][string]$Layout,
    [Parameter(Mandatory = $true)][string]$Output,
    [string]$ApiUrl = "http://localhost:8000"
)

python -m store_intelligence.pipeline.detect --video $Video --layout $Layout --output $Output --api-url $ApiUrl