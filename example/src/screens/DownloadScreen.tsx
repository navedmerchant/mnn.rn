import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import RNFS from 'react-native-fs';
import type { DownloadProgress, HFFile } from '../types';

interface DownloadScreenProps {
  onDownloadComplete: (modelPath: string) => void;
}

export default function DownloadScreen({
  onDownloadComplete,
}: DownloadScreenProps) {
  const [repoUrl, setRepoUrl] = useState(
    'https://huggingface.co/taobao-mnn/Qwen3-1.7B-MNN'
  );
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] =
    useState<DownloadProgress | null>(null);

  // Parse HuggingFace URL to extract owner/repo
  const parseHFUrl = (url: string): { owner: string; repo: string } | null => {
    const match = url.match(/huggingface\.co\/([^/]+)\/([^/]+)/);
    if (!match || !match[1] || !match[2]) return null;
    return { owner: match[1], repo: match[2] };
  };

  // Fetch file tree from HuggingFace API
  const fetchHFFileTree = async (
    owner: string,
    repo: string
  ): Promise<HFFile[]> => {
    const apiUrl = `https://huggingface.co/api/models/${owner}/${repo}/tree/main`;
    const apiResponse = await fetch(apiUrl);
    if (!apiResponse.ok) {
      throw new Error(`Failed to fetch file tree: ${apiResponse.statusText}`);
    }
    const files = await apiResponse.json();
    return files
      .filter((file: any) => file.type === 'file')
      .map((file: any) => ({
        path: file.path,
        size: file.size || 0,
        type: file.type,
      }));
  };

  // Download a single file from HuggingFace
  const downloadFile = async (
    owner: string,
    repo: string,
    filePath: string,
    destPath: string,
    onProgress: (bytesWritten: number) => void
  ): Promise<void> => {
    const url = `https://huggingface.co/${owner}/${repo}/resolve/main/${filePath}`;

    const downloadResult = await RNFS.downloadFile({
      fromUrl: url,
      toFile: destPath,
      progressDivider: 10,
      begin: () => {
        console.log('Download started:', filePath);
      },
      progress: (res) => {
        onProgress(res.bytesWritten);
      },
    }).promise;

    if (downloadResult.statusCode !== 200) {
      throw new Error(
        `Failed to download ${filePath}: HTTP ${downloadResult.statusCode}`
      );
    }
  };

  // Main download handler
  const handleDownloadModel = async () => {
    const parsed = parseHFUrl(repoUrl);
    if (!parsed) {
      Alert.alert(
        'Error',
        'Invalid HuggingFace URL. Format: https://huggingface.co/owner/repo'
      );
      return;
    }

    const { owner, repo } = parsed;
    const downloadDir = `${RNFS.DocumentDirectoryPath}/models/${repo}`;

    setIsDownloading(true);
    setDownloadProgress({
      totalFiles: 0,
      downloadedFiles: 0,
      currentFile: '',
      bytesDownloaded: 0,
      totalBytes: 0,
    });

    try {
      // Create download directory
      const dirExists = await RNFS.exists(downloadDir);
      if (dirExists) {
        await RNFS.unlink(downloadDir);
      }
      await RNFS.mkdir(downloadDir);

      // Fetch file list
      const files = await fetchHFFileTree(owner, repo);
      const totalBytes = files.reduce((sum, f) => sum + f.size, 0);

      setDownloadProgress({
        totalFiles: files.length,
        downloadedFiles: 0,
        currentFile: '',
        bytesDownloaded: 0,
        totalBytes,
      });

      let totalDownloaded = 0;

      // Download each file
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file) continue;

        const destPath = `${downloadDir}/${file.path}`;

        // Create subdirectories if needed
        const destDir = destPath.substring(0, destPath.lastIndexOf('/'));
        const destDirExists = await RNFS.exists(destDir);
        if (!destDirExists) {
          await RNFS.mkdir(destDir);
        }

        setDownloadProgress((prev) =>
          prev
            ? {
                ...prev,
                currentFile: file.path,
                downloadedFiles: i,
              }
            : null
        );

        await downloadFile(owner, repo, file.path, destPath, (bytesWritten) => {
          const currentFileBytes = bytesWritten;
          const previousFilesBytes = files
            .slice(0, i)
            .reduce((sum, f) => sum + f.size, 0);
          totalDownloaded = previousFilesBytes + currentFileBytes;

          setDownloadProgress((prev) =>
            prev
              ? {
                  ...prev,
                  bytesDownloaded: totalDownloaded,
                }
              : null
          );
        });
      }

      setDownloadProgress((prev) =>
        prev
          ? {
              ...prev,
              downloadedFiles: files.length,
              currentFile: 'Complete!',
            }
          : null
      );

      Alert.alert(
        'Success',
        `Downloaded ${files.length} files to ${downloadDir}.\nYou can now initialize the model.`,
        [
          {
            text: 'OK',
            onPress: () => onDownloadComplete(downloadDir + '/'),
          },
        ]
      );
    } catch (error: any) {
      Alert.alert('Download Error', error.message || String(error));
    } finally {
      setIsDownloading(false);
    }
  };

  const skipDownload = () => {
    Alert.alert(
      'Skip Download',
      'Enter the path to your pre-downloaded model directory',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Use Default Path',
          onPress: () =>
            onDownloadComplete(
              `${RNFS.DocumentDirectoryPath}/models/Qwen3-1.7B-MNN/`
            ),
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Download Model</Text>
        <Text style={styles.subtitle}>
          Download a Qwen model from HuggingFace to get started
        </Text>

        <View style={styles.inputSection}>
          <Text style={styles.label}>HuggingFace Repository URL</Text>
          <TextInput
            style={styles.input}
            value={repoUrl}
            onChangeText={setRepoUrl}
            placeholder="https://huggingface.co/owner/repo"
            editable={!isDownloading}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <TouchableOpacity
          style={[styles.button, isDownloading && styles.buttonDisabled]}
          onPress={handleDownloadModel}
          disabled={isDownloading}
        >
          {isDownloading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Download Model</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.buttonSecondary]}
          onPress={skipDownload}
          disabled={isDownloading}
        >
          <Text style={styles.buttonText}>Skip (Use Existing Model)</Text>
        </TouchableOpacity>

        {downloadProgress && (
          <View style={styles.progressSection}>
            <Text style={styles.progressTitle}>Download Progress</Text>
            <Text style={styles.progressText}>
              Files: {downloadProgress.downloadedFiles} /{' '}
              {downloadProgress.totalFiles}
            </Text>
            <Text style={styles.progressText}>
              Current: {downloadProgress.currentFile}
            </Text>
            <Text style={styles.progressText}>
              Downloaded:{' '}
              {(downloadProgress.bytesDownloaded / 1024 / 1024).toFixed(2)} MB /{' '}
              {(downloadProgress.totalBytes / 1024 / 1024).toFixed(2)} MB
            </Text>
            {downloadProgress.totalBytes > 0 && (
              <View style={styles.progressBarContainer}>
                <View
                  style={[
                    styles.progressBar,
                    {
                      width: `${(downloadProgress.bytesDownloaded / downloadProgress.totalBytes) * 100}%`,
                    },
                  ]}
                />
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
  },
  inputSection: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    backgroundColor: '#fff',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonSecondary: {
    backgroundColor: '#666',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  progressSection: {
    marginTop: 20,
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  progressTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
    color: '#333',
  },
  progressText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 6,
  },
  progressBarContainer: {
    height: 20,
    backgroundColor: '#e0e0e0',
    borderRadius: 10,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 10,
  },
});
