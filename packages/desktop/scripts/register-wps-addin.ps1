$publishPath = Join-Path $env:APPDATA 'kingsoft\wps\jsaddons\publish.xml'
$publishDir = Split-Path -Parent $publishPath
$addinName = 'contract-review-wps'
$addinUrl = 'https://localhost:3000/wps-addin/'

New-Item -ItemType Directory -Path $publishDir -Force | Out-Null

if (Test-Path $publishPath) {
    [xml]$doc = Get-Content $publishPath
} else {
    $doc = New-Object System.Xml.XmlDocument
    $declaration = $doc.CreateXmlDeclaration('1.0', 'UTF-8', $null)
    $null = $doc.AppendChild($declaration)
    $root = $doc.CreateElement('jsplugins')
    $null = $doc.AppendChild($root)
}

$rootNode = $doc.SelectSingleNode('/jsplugins')
if (-not $rootNode) {
    $rootNode = $doc.CreateElement('jsplugins')
    $null = $doc.AppendChild($rootNode)
}

$existingNodes = @($rootNode.SelectNodes("jspluginonline[@name='$addinName']"))
$node = $existingNodes | Select-Object -First 1

if (-not $node) {
    $node = $doc.CreateElement('jspluginonline')
    $null = $rootNode.AppendChild($node)
}

foreach ($extraNode in ($existingNodes | Select-Object -Skip 1)) {
    $null = $rootNode.RemoveChild($extraNode)
}

$attributes = @{
    name = $addinName
    type = 'wps'
    url = $addinUrl
    debug = ''
    enable = 'enable_dev'
    install = 'null'
}

foreach ($pair in $attributes.GetEnumerator()) {
    $node.SetAttribute($pair.Key, $pair.Value)
}

$doc.Save($publishPath)
Write-Host "Registered WPS add-in: $addinUrl"
