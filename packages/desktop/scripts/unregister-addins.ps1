$addinId = '5E6F7A8B-9C0D-1E2F-3A4B-5C6D7E8F9A0B'
$wpsAddinName = 'contract-review-wps'
$wpsAddinUrl = 'https://localhost:3000/wps-addin/'

$wordCatalogPath = "HKCU:\Software\Microsoft\Office\16.0\WEF\TrustedCatalogs\$addinId"
$wordDeveloperPath = 'HKCU:\Software\Microsoft\Office\16.0\WEF\Developer'

Remove-Item -Path $wordCatalogPath -Recurse -Force -ErrorAction SilentlyContinue
Remove-ItemProperty -Path $wordDeveloperPath -Name $addinId -ErrorAction SilentlyContinue
Remove-ItemProperty -Path $wordDeveloperPath -Name 'RefreshAddins' -ErrorAction SilentlyContinue
Remove-Item -Path "$env:LOCALAPPDATA\Microsoft\Office\16.0\Wef\*" -Recurse -Force -ErrorAction SilentlyContinue

$publishPath = Join-Path $env:APPDATA 'kingsoft\wps\jsaddons\publish.xml'
if (Test-Path $publishPath) {
    [xml]$doc = Get-Content $publishPath
    $rootNode = $doc.SelectSingleNode('/jsplugins')
    if ($rootNode) {
        $nodes = @($rootNode.SelectNodes("jspluginonline[@name='$wpsAddinName' or @url='$wpsAddinUrl']"))
        foreach ($node in $nodes) {
            $null = $rootNode.RemoveChild($node)
        }
        $doc.Save($publishPath)
    }
}

Write-Host 'Unregistered Word and WPS add-ins.'
