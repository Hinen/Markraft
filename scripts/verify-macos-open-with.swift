import AppKit
import Foundation

guard CommandLine.arguments.count == 3 else {
    fatalError("Usage: swift verify-macos-open-with.swift tauri.conf.json Markraft.app")
}

struct Config: Decodable {
    struct Bundle: Decodable {
        struct Association: Decodable { let ext: [String] }
        let fileAssociations: [Association]
    }
    let bundle: Bundle
}

let config = try JSONDecoder().decode(
    Config.self,
    from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))
)
let appPath = URL(fileURLWithPath: CommandLine.arguments[2]).resolvingSymlinksInPath().path
let directory = FileManager.default.temporaryDirectory.appendingPathComponent(
    "markraft-open-with-\(UUID().uuidString)", isDirectory: true
)
try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
defer { try? FileManager.default.removeItem(at: directory) }

var missing: [String] = []
for ext in config.bundle.fileAssociations[0].ext {
    let file = directory.appendingPathComponent("document.\(ext)")
    try Data("sample\n".utf8).write(to: file)
    let apps = NSWorkspace.shared.urlsForApplications(toOpen: file)
    if !apps.contains(where: { $0.resolvingSymlinksInPath().path == appPath }) {
        missing.append(ext)
    }
}

if !missing.isEmpty {
    fatalError("Markraft is absent from Open With for: \(missing.joined(separator: ", "))")
}
print("Verified Open With candidates for \(config.bundle.fileAssociations[0].ext.count) extensions")
